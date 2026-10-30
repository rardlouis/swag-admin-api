import { AdminController } from './admin.controller';

describe('AdminController profile updates', () => {
  it('uses the authenticated administrator identity instead of the URL identifier', async () => {
    const adminService = { updateProfile: jest.fn().mockResolvedValue({ id: 'session-admin' }) };
    const authService = {};
    const controller = new AdminController(adminService as never, authService as never);
    const body = { fullName: 'Admin User', email: 'admin@example.com' };

    await expect(controller.updateProfile('other-admin', body, { user: { sub: 'session-admin', admin: true, exp: 1 } }))
      .resolves.toEqual({ id: 'session-admin' });
    expect(adminService.updateProfile).toHaveBeenCalledWith('session-admin', body);
  });

  it('loads the currently authenticated administrator profile', async () => {
    const adminService = { profile: jest.fn().mockResolvedValue({ id: 'session-admin' }) };
    const controller = new AdminController(adminService as never, {} as never);

    await expect(controller.profile({ user: { sub: 'session-admin', admin: true, exp: 1 } }))
      .resolves.toEqual({ id: 'session-admin' });
    expect(adminService.profile).toHaveBeenCalledWith('session-admin');
  });
});
