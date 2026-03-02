import type { NextPage } from 'next';
import { healthSchema } from '@profile/shared';

const Home: NextPage = () => {
  const health = healthSchema.parse({ status: 'ok' });

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Profile Monorepo</h1>
      <p>Shared schema status: {health.status}</p>
    </main>
  );
};

export default Home;
