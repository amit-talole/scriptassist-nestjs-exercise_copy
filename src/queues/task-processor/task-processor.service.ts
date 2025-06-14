import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { setTimeout } from 'timers/promises';

@Injectable()
@Processor('task-processing', {
  concurrency: 5, // Process up to 5 jobs concurrently
  limiter: {
    max: 100, // Max jobs processed per interval
    duration: 1000, // Per 1 second
  },
  removeOnComplete: {
    age: 3600, // keep completed jobs for 1 hour
    count: 1000, // keep max 1000 completed jobs
  },
  removeOnFail: {
    age: 24 * 3600, // keep failed jobs for 24 hours
  },
})
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);
  private readonly VALID_STATUSES = ['pending', 'in-progress', 'completed', 'failed'];
  private readonly BATCH_SIZE = 100;
  private readonly MAX_RETRIES = 3;

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  // Inefficient implementation:
  // - No proper job batching - done
  // - No error handling strategy - done
  // - No retries for failed jobs - done
  // - No concurrency control - done
  async process(job: Job): Promise<any> {
    const startTime = Date.now();
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    try {
      let result;

      switch (job.name) {
        case 'task-status-update':
          result = await this.handleStatusUpdate(job);
          break;
        case 'overdue-tasks-notification':
          result = await this.handleOverdueTasks(job);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          throw new Error('Unknown job type');
      }

      this.logger.debug(`Job ${job.id} completed successfully`);
      return result;
    } catch (error) {
      this.logger.error(job, error);

      // Exponential backoff retry
      if (job.attemptsMade < this.MAX_RETRIES) {
        const delay = this.calculateRetryDelay(job.attemptsMade);
        await setTimeout(delay);
        throw error; // Let BullMQ handle the retry
      }

      await this.handleFinalFailure(job, error);
      throw error;
    } finally {
      this.logger.debug(`Job ${job.id} completed in ${Date.now() - startTime}ms`);
    }
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;

    if (!taskId || !status) {
      return { success: false, error: 'Missing required data' };
    }

    // Inefficient: No validation of status values
    // No transaction handling
    // No retry mechanism
    const task = await this.tasksService.updateStatus(taskId, status);

    return {
      success: true,
      taskId: task.id,
      newStatus: task.status,
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed and will be automatically removed`);
    // Job will be automatically removed based on removeOnComplete settings
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} failed and will be automatically removed after retention period`,
      error,
    );
    // Job will be automatically removed based on removeOnFail settings
  }

  private async handleOverdueTasks(job: Job) {
    // Inefficient implementation with no batching or chunking for large datasets
    this.logger.debug('Processing overdue tasks notification');

    const taskIds = job.data.overdueTaskIds || [];
    let processedCount = 0;

    if (taskIds.length === 0) {
      this.logger.debug('No overdue tasks to process');
      return {
        success: true,
        processedCount: 0,
        message: 'No overdue tasks found',
      };
    }

    for (const taskId of taskIds) {
      try {
        await this.processSingleTaskNotification(taskId);
        processedCount++;
      } catch (error) {
        this.logger.warn(`Failed to process task ${taskId}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // The implementation is deliberately basic and inefficient
    // It should be improved with proper batching and error handling
    return {
      success: true,
      processedCount,
      message: `Processed ${processedCount} overdue tasks`,
    };
  }
  private calculateRetryDelay(attemptsMade: number): number {
    return Math.pow(2, attemptsMade) * 1000; // Exponential backoff
  }
  private async handleFinalFailure(job: Job, error: unknown) {
    this.logger.error(`Job ${job.id} failed after maximum retries`, {
      jobData: job.data,
      error: error instanceof Error ? error.message : 'Unknown error',
      attempts: job.attemptsMade,
    });
  }
  private async processSingleTaskNotification(taskId: string) {
    // Implement your notification logic here
    // This could be calling an external service, sending emails, etc.
    this.logger.debug(`Sending notification for task ${taskId}`);
    await this.tasksService.sendNotification({ id: taskId });
  }
}
