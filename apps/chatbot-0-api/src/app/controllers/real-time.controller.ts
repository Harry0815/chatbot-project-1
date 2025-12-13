import { Controller, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { RealTimeService } from '@chatbot-project-1/openai';
import { FastifyReply, FastifyRequest } from 'fastify';

@ApiTags('RealTime')
@Controller('realtime')
export class RealTimeController {
  constructor(private readonly rtoService: RealTimeService) {}

  @Post('webrtc/offer')
  @ApiBody({})
  async handleOffer(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const body = req.body as Record<string, unknown> | undefined;
    const offer = body && (body['offer'] as unknown);
    if (!offer) {
      res.status(400).send({ error: 'Missing offer in request body' });
      return;
    }

    try {
      const result = await this.rtoService.handleOffer(offer);
      res.send(result);
    } catch (err) {
      console.error('Failed to handle offer:', err);
      res.status(500).send({ error: 'Failed to handle offer' });
    }
  }

  @Post('stop')
  @ApiBody({})
  async stopSession(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const body = req.body as Record<string, unknown> | undefined;
    const sessionId = body && typeof body['sessionId'] === 'string' ? (body['sessionId'] as string) : null;
    if (!sessionId) {
      res.status(400).send({ error: 'Missing sessionId in request body' });
      return;
    }

    try {
      await this.rtoService.stopSession(sessionId);
      res.send({ ok: true });
    } catch (err) {
      console.error('Failed to stop session:', err);
      res.status(500).send({ error: 'Failed to stop session' });
    }
  }
}
