import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  HttpException,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

// This guard needs to be implemented or imported from the correct location
// We're intentionally leaving it as a non-working placeholder
// class JwtAuthGuard {}

// above gard imported from correct location

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Throttle({ default: { limit: 100, ttl: 6000 } })
@ApiBearerAuth()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    // Anti-pattern: Controller directly accessing repository
    //done
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @ApiOperation({ summary: 'Find all tasks with optional filtering' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Query('status') status?: TaskStatus,
    @Query('priority') priority?: TaskPriority,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    // // Inefficient approach: Inconsistent pagination handling - Done

    // Inefficient processing: Manual filtering instead of using repository -Done
    const { data, total } = await this.tasksService.findFiltered({ status, priority, page, limit });
    return {
      data,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    };
    //  Inefficient filtering: In-memory filtering instead of database filtering - Done

    // Inefficient pagination: In-memory pagination -Done
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics' })
  async getStats() {
    // Inefficient approach: N+1 query problem -done
    const tasks = await this.tasksService.getStatsAsync();
    // Inefficient computation: Should be done with SQL aggregation - done

    return tasks;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Param('id') id: string) {
    const task = await this.tasksService.findOne(id);

    // Inefficient error handling: Revealing internal details - Done
    return task;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    // No validation if task exists before update -Done
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  remove(@Param('id') id: string) {
    // No validation if task exists before removal - Done
    // No status code returned for success - Done
    return this.tasksService.remove(id);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  async batchProcess(@Body() operations: { tasks: string[]; action: string }) {
    // Inefficient batch processing: Sequential processing instead of bulk operations - Done
    const { tasks, action } = operations;
    // N+1 query problem: Processing tasks one by one - Done
    switch (action) {
      case 'complete':
        return await this.tasksService.updateManyWithSuccessStatus(tasks);
        break;
      case 'delete':
        return await this.tasksService.bulkDelete(tasks);
        break;
      default:
        throw new HttpException(`Unknown action: ${action}`, HttpStatus.BAD_REQUEST);
    }
  }
}
