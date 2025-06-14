import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email');
    }

    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }
    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken(user);
    await this.usersService.upsertRefreshToken(refreshToken, user.id);
    return {
      access_token: token,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    console.log('registerDto', registerDto);

    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new UnauthorizedException('Email already exists');
    }

    const user = await this.usersService.create(registerDto);

    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken(user);
    await this.usersService.upsertRefreshToken(refreshToken, user.id);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      access_token: token,
      refresh_token: refreshToken,
    };
  }

  private generateToken(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwtService.sign(payload);
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.usersService.findOne(userId);

    if (!user) {
      return null;
    }

    return user;
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    return true;
  }
  private generateRefreshToken(user: User): string {
    const payload = { sub: user.id, email: user.email, role: user.role };

    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: '1 days',
    });
  }
  async refreshTokenAsync(refreshToken: string, user: any): Promise<{ refresh_token: string }> {
    console.log('user', user);

    const result = await this.usersService.findByToken(refreshToken);
    if (!result) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.usersService.upsertRefreshToken(refreshToken, user?.sub);
    const response = this.generateRefreshToken(user);
    return {
      refresh_token: response,
    };
  }
}
