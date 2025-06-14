import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { testCredentials, user, testTasks } from './test-constants';

jest.setTimeout(600000);

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    await app.init();

    // Login to get access token
    const loginRes = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'user@example.com',
      password: 'user123',
    });

    accessToken = loginRes.body.access_token;
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET) - should be protected', () => {
    return request(app.getHttpServer()).get('/').expect(401);
  });

  it('/auth/login (POST) - success', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(testCredentials.validUser)
      .expect(201);

    expect(response.body).toHaveProperty('access_token');
  });

  it('/auth/login (POST) - fail with wrong credentials', async () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send(testCredentials.invalidUser)
      .expect(401);
  });

  it('/users (GET) - success', async () => {
    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(Array.isArray(response.body));
  });

  it('/users (GET) - should fail without token', () => {
    return request(app.getHttpServer()).get('/users').expect(401);
  });

  it('/users/:id (GET) - success', async () => {
    const response = await request(app.getHttpServer())
      .get(`/users/${user.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(response.body).toHaveProperty('id', '550e8400-e29b-41d4-a716-446655440001');
  });

  it('/users/:id (GET) - fail with invalid UUID', async () => {
    const response = await request(app.getHttpServer())
      .get(`/users/${user.invalid}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
    expect(response.body).toHaveProperty('statusCode', 400);
  });

  it('/users/:id (GET) - fail with Not Found', async () => {
    const response = await request(app.getHttpServer())
      .get(`/users/${user.notFound}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(response.body).toHaveProperty('statusCode', 404);
  });

  it('/tasks/:id (GET) - should fail without token', () => {
    return request(app.getHttpServer()).get('/tasks/:id').expect(401);
  });

  it('/users/:id (PATCH) - success', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/users/${user.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'John Doe' })
      .expect(200);
    expect(response.body).toHaveProperty('id', '550e8400-e29b-41d4-a716-446655440001');
  });

  it('/users/:id (PATCH) - fail with invalid UUID', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/users/${user.invalid}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'John Doe' })
      .expect(400);
    expect(response.body).toHaveProperty('statusCode', 400);
  });

  it('/users/:id (PATCH) - fail with Not Found', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/users/${user.notFound}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'John Doe' })
      .expect(404);
    expect(response.body).toHaveProperty('statusCode', 404);
  });

  it('/users/:id (PATCH) - fail with wihtou token', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/users/${user.id}`)
      .send({ name: 'John Doe' })
      .expect(401);
    expect(response.body).toHaveProperty('statusCode', 401);
  });
  //

  it('/tasks (GET) - should fail without token', () => {
    return request(app.getHttpServer()).get('/tasks').expect(401);
  });

  it('/tasks (GET) - success with token', async () => {
    const response = await request(app.getHttpServer())
      .get('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body));
  });

  it('/tasks (POST) - create task with valid data', async () => {
    const response = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(testTasks.taskDto)
      .expect(201);

    expect(response.body).toMatchObject({
      title: testTasks.taskDto.title,
      description: testTasks.taskDto.description,
      status: testTasks.taskDto.status,
    });
  });

  it('/tasks (POST) - fail with invalid data', async () => {
    const response = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(testTasks.invalidDto)
      .expect(400);

    expect(response.body.message).toBeDefined();
  });

  it('/tasks/stats (GET) - should fail without token', () => {
    return request(app.getHttpServer()).get('/tasks').expect(401);
  });

  it('/tasks (GET) - success with token', async () => {
    const response = await request(app.getHttpServer())
      .get('/tasks/stats')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body));
  });
  //
  it('/tasks/:id (GET) - success', async () => {
    const response = await request(app.getHttpServer())
      .get(`/tasks/${testTasks.validTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(response.body).toHaveProperty('id', '09953307-74f1-45a8-8a2b-8fbf2b6027c2');
  });

  it('/tasks/:id (GET) - fail with Not Found', async () => {
    const response = await request(app.getHttpServer())
      .get(`/tasks/${testTasks.invalidTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
    expect(response.body).toHaveProperty('statusCode', 404);
  });

  it('/tasks/:id (GET) - should fail without token', () => {
    return request(app.getHttpServer()).get('/tasks/:id').expect(401);
  });

  it('/tasks/:id (PATCH) - success', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tasks/${testTasks.validTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Complete project documentation' })
      .expect(200);
    expect(response.body).toHaveProperty('id', '09953307-74f1-45a8-8a2b-8fbf2b6027c2');
  });

  it('/tasks/:id (PATCH) - fail with bad request', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tasks/${testTasks.invalidTaskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Complete project documentation' })
      .expect(404);
    expect(response.body).toHaveProperty('statusCode', 404);
  });

  it('/health (GET) - success with token', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(Array.isArray(response.body));
  });
});
