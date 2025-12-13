import { Controller, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { RealTimeService } from '../services/RealTime.service';
import { FastifyReply, FastifyRequest } from 'fastify';

@ApiTags('RealTime')
@Controller('realtime')
export class RealTimeController {
  constructor(private readonly rtoService: RealTimeService) {}

  @Post('webrtc/offer')
  @ApiBody({})
  async handleOffer(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    const { offer } = req.body;
    const { answer } = await this.rtoService.handleOffer(offer);
    res.send({ answer });
  }
}
