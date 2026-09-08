import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: { login?: string; email?: string; password?: string }) {
    return this.authService.login(body);
  }

  @Post('app/login')
  appLogin(@Body() body: { email?: string; password?: string }) {
    return this.authService.appLogin(body);
  }

  @Post('app/register')
  appRegister(@Body() body: unknown) {
    return this.authService.appRegister(body);
  }

  @Post('email-otp/send')
  sendEmailOtp(@Body('email') email: string) { return this.authService.sendEmailOtp(email); }

  @Post('email-otp/verify')
  verifyEmailOtp(@Body() body: { email?: string; code?: string }) { return this.authService.verifyEmailOtp(body.email, body.code); }

  @Get('address-autocomplete')
  addressAutocomplete(@Query('text') text: string) { return this.authService.addressAutocomplete(text); }

  @Patch('app/profile/:id')
  updateAppProfile(@Param('id') id: string, @Body() body: unknown) {
    return this.authService.updateAppProfile(id, body);
  }

  @Patch('app/account/:id')
  updateAppAccount(@Param('id') id: string, @Body() body: unknown) {
    return this.authService.updateAppAccount(id, body);
  }

  @Patch('app/verify-id/:id')
  verifyAppId(@Param('id') id: string, @Body() body: unknown) {
    return this.authService.verifyAppId(id, body);
  }
}
