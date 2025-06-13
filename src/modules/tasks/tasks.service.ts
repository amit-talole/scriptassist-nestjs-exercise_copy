import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { DataSource } from 'typeorm';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    try {
      if (createTaskDto?.dueDate?.trim()) {
        const checkDate = await this.isValidIsoUtc(createTaskDto?.dueDate);
        if (!checkDate) {
          throw new HttpException('Invalid Date Format', 401);
        }
      }
      return await this.dataSource.transaction(async manager => {
        const task = manager.getRepository(Task).create(createTaskDto);
        const savedTask = await manager.getRepository(Task).save(task);

        try {
          await this.taskQueue.add('task-status-update', {
            taskId: savedTask.id,
            status: savedTask.status,
          });
        } catch (error) {
          // Optionally: Log error, rollback manually, or rethrow
          throw new InternalServerErrorException('Failed to queue task for processing');
        }

        return savedTask;
      });
    } catch (error: any) {
      if (error?.status === HttpStatus.UNAUTHORIZED) {
        throw new HttpException(error?.response, error?.status);
      }
      throw new InternalServerErrorException(error?.response);
    }
  }

  async findFiltered({
    status,
    priority,
    page = 1,
    limit = 10,
  }: {
    status?: TaskStatus;
    priority?: TaskPriority;
    page?: number;
    limit?: number;
  }): Promise<{ data: Task[]; total: number }> {
    const qb = this.tasksRepository.createQueryBuilder('task');

    if (status) {
      qb.andWhere('task.status = :status', { status });
    }

    if (priority) {
      qb.andWhere('task.priority = :priority', { priority });
    }

    qb.leftJoinAndSelect('task.user', 'user');

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Task> {
    // Inefficient implementation: two separate database calls - done
    return this.tasksRepository
      .findOneOrFail({
        where: { id },
        relations: ['user'],
      })
      .catch(() => {
        throw new NotFoundException(`Task with ID ${id} not found`);
      });
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    return await this.dataSource.transaction(async manager => {
      const taskRepository = manager.getRepository(Task);

      // Preload merges the ID and update DTO into a Task entity
      const task = await taskRepository.findOne({ where: { id } });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const originalStatus = task.status;

      Object.assign(task, updateTaskDto);

      const updatedTask = await taskRepository.save(task);

      if (updateTaskDto.status && updateTaskDto.status !== originalStatus) {
        try {
          await this.taskQueue.add('tasktask-status-update', {
            taskId: updatedTask.id,
            status: updatedTask.status,
          });
        } catch (err) {
          console.error('Queue add failed:', err);
          throw new InternalServerErrorException('Failed to enqueue task update');
        }
      }

      return updatedTask;
    });
  }

  async remove(id: string): Promise<{ message: string }> {
    const result = await this.tasksRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    } else {
      return { message: `Task with ID ${id} deleted successfully` };
    }
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Inefficient implementation: doesn't use proper repository patterns
    const query = 'SELECT * FROM tasks WHERE status = $1';
    return this.tasksRepository.query(query, [status]);
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // This method will be called by the task processor
    const task = await this.findOne(id);
    task.status = status as any;
    return this.tasksRepository.save(task);
  }
  async getStatsAsync(): Promise<Task[]> {
    const qb = this.tasksRepository.createQueryBuilder('task');

    const [result] = await qb
      .select([
        'COUNT(*)::int AS total',
        `COUNT(*) FILTER (WHERE task.status = 'COMPLETED')::int AS "completed"`,
        `COUNT(*) FILTER (WHERE task.status = 'IN_PROGRESS')::int AS "inProgress"`,
        `COUNT(*) FILTER (WHERE task.status = 'PENDING')::int AS "pending"`,
        `COUNT(*) FILTER (WHERE task.priority = 'HIGH')::int AS "highPriority"`,
      ])
      .getRawMany();

    return result;
  }
  async isValidIsoUtc(dateStr: any) {
    const isoUtcWithMillisRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    return (
      isoUtcWithMillisRegex.test(new Date(dateStr)?.toISOString()) &&
      !isNaN(new Date(new Date(dateStr)?.toISOString()).getTime())
    );
  }
  async updateManyWithSuccessStatus(id: string[]): Promise<Task> {
    return await this.dataSource.transaction(async manager => {
      const taskRepository = manager.getRepository(Task);
      const results = [];
      const bulkUpdate = [];

      // Preload merges the ID and update DTO into a Task entity
      const task = await taskRepository.query(
        `update tasks set status = '${TaskStatus.COMPLETED}' where id in ('${id.join().replace(',', "','")}') and status <> '${TaskStatus.COMPLETED}' returning *`,
      );
      console.log('task', task);
      for (let index = 0; index < task[0].length; index += 1) {
        results.push({ taskId: task[0][index].id, success: true, result: task[index] });
        bulkUpdate.push({
          name: 'tasktask-status-update',
          data: {
            taskId: task[0][index].id,
            status: TaskStatus.COMPLETED,
          },
        });
      }

      if (!results.length) {
        throw new NotFoundException(`Task not found`);
      }
      if (results && bulkUpdate) {
        try {
          await this.taskQueue.addBulk(bulkUpdate);
        } catch (err) {
          console.error('Queue add failed:', err);
          throw new InternalServerErrorException('Failed to enqueue task update');
        }
      }

      return task;
    });
  }
  async bulkDelete(
    taskIds: string[],
  ): Promise<{ taskId: string; success: boolean; message: string }[]> {
    const results = [];

    for (const taskId of taskIds) {
      try {
        const res = await this.remove(taskId); // uses your existing `remove()` method
        results.push({ taskId, success: true, message: res.message });
      } catch (error) {
        results.push({
          taskId,
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }
}
