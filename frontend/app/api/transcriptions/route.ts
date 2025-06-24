import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';

    // Build where clause for search
    const where = search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { transcriptionText: { contains: search, mode: 'insensitive' as const } }
          ]
        }
      : {};

    // Get total count for pagination
    const total = await prisma.transcription.count({ where });

    // Get transcriptions with pagination
    const transcriptions = await prisma.transcription.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        title: true,
        description: true,
        originalAudioFileName: true,
        backend: true,
        language: true,
        transcriptionText: true,
        processingTimeMs: true,
        fileSizeBytes: true,
        durationSeconds: true,
        riskDetectionStatus: true,
        riskDetectionResult: true,
        riskConfidence: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true
      },
      skip: (page - 1) * limit,
      take: limit
    });

    return NextResponse.json({
      transcriptions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching transcriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcriptions' },
      { status: 500 }
    );
  }
}
