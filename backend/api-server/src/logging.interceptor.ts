import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const userId = req.headers['x-user-id'] ?? req.user?.userId ?? 'anonymous';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        process.stdout.write(
          JSON.stringify({
            event: 'request',
            method,
            path: url,
            status: res.statusCode,
            duration_ms: Date.now() - start,
            user_id: userId,
          }) + '\n',
        );
      }),
    );
  }
}
