import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionAuthGuard, requireOwnership, type SessionIdentity } from '../common/session-auth';

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

  @Post('sms-otp/send')
  sendSmsOtp(@Body('phone') phone: string) { return this.authService.sendSmsOtp(phone); }

  @Post('sms-otp/verify')
  verifySmsOtp(@Body() body: { verificationId?: string; phone?: string; code?: string }) {
    return this.authService.verifySmsOtp(body.verificationId, body.phone, body.code);
  }

  @Get('address-autocomplete')
  addressAutocomplete(@Query('text') text: string) { return this.authService.addressAutocomplete(text); }

  @Get('address-reverse-geocode')
  reverseGeocodeAddress(@Query('lat') latitude: string, @Query('lon') longitude: string) {
    return this.authService.reverseGeocodeAddress(latitude, longitude);
  }

  @Patch('app/profile/:id')
  @UseGuards(SessionAuthGuard)
  updateAppProfile(@Param('id') id: string, @Body() body: unknown, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, id);
    return this.authService.updateAppProfile(id, body);
  }

  @Patch('app/account/:id')
  @UseGuards(SessionAuthGuard)
  updateAppAccount(@Param('id') id: string, @Body() body: unknown, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, id);
    return this.authService.updateAppAccount(id, body);
  }

  @Patch('app/verify-id/:id')
  @UseGuards(SessionAuthGuard)
  verifyAppId(@Param('id') id: string, @Body() body: unknown, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, id);
    return this.authService.verifyAppId(id, body);
  }

  @Delete('app/account/:id')
  @UseGuards(SessionAuthGuard)
  deleteAppAccount(@Param('id') id: string, @Body() body: { email?: string; password?: string; confirmation?: string }, @Req() request: { user?: SessionIdentity }) {
    requireOwnership(request.user, id);
    return this.authService.deleteAppAccount(id, body);
  }

  @Post('app/account/reactivate')
  reactivateAppAccount(@Body() body: { email?: string; password?: string }) {
    return this.authService.reactivateAppAccount(body);
  }
}
