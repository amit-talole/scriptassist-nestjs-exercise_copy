import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class AppController {
  @Get()
  findAll() {
    return {
      status: HttpStatus.OK,
      message: 'healthy',
    };
  }
}
