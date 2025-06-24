import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const transcription = await prisma.transcription.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        originalAudioFileName: true,
        backend: true,
        language: true,
        transcriptionResultJson: true,
        transcriptionText: true,
        processingTimeMs: true,
        fileSizeBytes: true,
        durationSeconds: true,
        audioSampleRate: true,
        riskDetectionStatus: true,
        riskDetectionResult: true,
        riskDetectionResponse: true,
        riskAnalyzedAt: true,
        riskConfidence: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!transcription) {
      return NextResponse.json(
        { error: 'Transcription not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(transcription);
  } catch (error) {
    console.error('Error fetching transcription:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcription' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if transcription exists
    const transcription = await prisma.transcription.findUnique({
      where: { id },
      select: { id: true, originalAudioFileName: true }
    });

    if (!transcription) {
      return NextResponse.json(
        { error: 'Transcription not found' },
        { status: 404 }
      );
    }

    // Delete the transcription record
    await prisma.transcription.delete({
      where: { id }
    });

    // TODO: Optionally delete the audio file from filesystem
    // For now we'll keep the files for safety

    return NextResponse.json({ 
      success: true, 
      message: 'Transcription deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting transcription:', error);
    return NextResponse.json(
      { error: 'Failed to delete transcription' },
      { status: 500 }
    );
  }
}
