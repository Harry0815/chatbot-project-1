import { RealTimeService } from '../libs/openai/src/lib/real-time.service';

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY is not set. Aborting connection test. Set OPENAI_API_KEY in env and re-run to test the websocket connection.');
    process.exit(0);
  }

  const svc = new RealTimeService();

  try {
    // Replace internal files list inside the service before calling if desired.
    await svc.streamToServer();
  } catch (err) {
    console.error('Error while running streamToServer:', err);
    process.exit(1);
  }
})();

