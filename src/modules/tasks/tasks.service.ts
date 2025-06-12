import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
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
    // Inefficient implementation: creates the task but doesn't use a single transaction
    // for creating and adding to queue, potential for inconsistent state
    const task = this.tasksRepository.create(createTaskDto);
    const savedTask = await this.tasksRepository.save(task);

    // Add to queue without waiting for confirmation or handling errors
    this.taskQueue.add('task-status-update', {
      taskId: savedTask.id,
      status: savedTask.status,
    });

    return savedTask;
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
}
