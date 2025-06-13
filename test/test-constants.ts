export const testCredentials = {
  validUser: {
    email: 'user@example.com',
    password: 'user123',
  },
  invalidUser: {
    email: 'wrong@example.com',
    password: 'wrongpass',
  },
};

export const testTasks = {
  validTaskId: '09953307-74f1-45a8-8a2b-8fbf2b6027c2',
  invalidTaskId: '09953307-74f1-45a8-8a2b-8fbf2b6027cc',
  taskDto: {
    title: 'Complete project documentation',
    description: 'Add details about API endpoints and data models',
    status: 'PENDING',
    priority: 'MEDIUM',
    dueDate: '2023-12-31T23:59:59Z',
    userId: '550e8400-e29b-41d4-a716-446655440001',
  },
  invalidDto: { title: '', dueDate: 'not-a-date' },
};
export const user = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  invalid: '550e8400-e29b-41d4-a716-44665544000',
  notFound: '550e8400-e29b-41d4-a716-446655440005',
};
