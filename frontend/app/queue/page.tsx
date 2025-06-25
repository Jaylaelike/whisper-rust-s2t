'use client';

import { QueueOverviewNew } from '@/components/queue-overview-new';

export default function QueuePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
      <div className="container mx-auto px-4 py-8 animate-fade-in">
        <QueueOverviewNew />
      </div>
    </div>
  );
}
