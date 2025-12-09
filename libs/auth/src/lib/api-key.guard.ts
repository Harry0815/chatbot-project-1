import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { isValidApiKey } from '@chatbot-project-1/db';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const token = authHeader.replace('Bearer', '').trim();

    if (!token) {
      throw new UnauthorizedException('Invalid Authorization format');
    }

    const valid = await isValidApiKey(token);

    if (!valid) {
      throw new ForbiddenException('Invalid API key');
    }

    return true;
  }
}
