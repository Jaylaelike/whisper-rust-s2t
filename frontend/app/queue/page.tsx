'use client';

import { QueueOverviewNew } from '@/components/queue-overview-new';

export default function QueuePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Processing Queue</h1>
      <QueueOverviewNew />
    </div>
  );
}
