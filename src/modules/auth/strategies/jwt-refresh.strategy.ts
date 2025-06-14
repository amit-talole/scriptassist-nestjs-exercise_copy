import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private readonly usersService: UsersService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const refreshToken = req.headers['authorization']?.split(' ')[1];
    if (!refreshToken) {
      throw new Error('Refresh token not found');
    }

    // Verify the token exists in our database and is valid
    const token = await this.usersService.findByToken(refreshToken);

    if (!token) {
      throw new UnauthorizedException('Token not found');
    }

    return { ...payload, refreshToken: token.refreshToken };
  }
}
