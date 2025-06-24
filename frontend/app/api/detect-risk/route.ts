import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

async function callOllamaAPI(text: string): Promise<string> {
  try {
    const prompt = `ประโยคเหล่านี้ มีข้อความที่เสี่ยงต่อการทำผิดกฎหมายหรือไม่ 
\`\`\`
${text}
\`\`\`
ตอบแค่เข้าข่ายผิด หรือ ไม่ผิดเท่านั้น ไม่ต้องตอบรายละเอียดอย่างยาว`;

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen3:8b',
        prompt: prompt,
        stream: false,
        // options: {
        //   temperature: 0.1,
        //   top_p: 0.9,
        //   num_predict: 500  // Allow longer responses for detailed analysis
        // }
      }),
    }).catch(error => {
      console.error('Fetch error:', error);
      throw new Error('Network error calling Ollama API');
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data: OllamaResponse = await response.json();
    return data.response || 'ไม่สามารถวิเคราะห์ได้';
  } catch (error) {
    console.error('Error calling Ollama API:', error);
    throw new Error('Failed to analyze risk');
  }
}

function extractRiskResult(response: string): string {
  const lowerResponse = response.toLowerCase();
  
  // Check for response after <think> section - extract the final answer after </think>
  const thinkMatch = response.match(/<think>[\s\S]*?<\/think>\s*([\s\S]*?)$/i);
  if (thinkMatch) {
    const afterThink = thinkMatch[1].trim().toLowerCase();
    if (afterThink.includes('เข้าข่ายผิด') || afterThink.includes('ผิดกฎหมาย')) {
      return 'เข้าข่ายผิด';
    } else if (afterThink.includes('ไม่ผิด') || afterThink.includes('ไม่เข้าข่าย')) {
      return 'ไม่ผิด';
    }
  }
  
  // First check for direct Thai answers anywhere in response
  if (lowerResponse.includes('เข้าข่ายผิด') || lowerResponse.includes('ผิดกฎหมาย')) {
    return 'เข้าข่ายผิด';
  } else if (lowerResponse.includes('ไม่ผิด') || lowerResponse.includes('ไม่เข้าข่าย') || lowerResponse.includes('ไม่มีความเสี่ยง')) {
    return 'ไม่ผิด';
  }
  
  // Check for boxed answers like \boxed{ใช่} or \boxed{ไม่ใช่}
  const boxedMatch = response.match(/\\?boxed\s*\{\s*([^}]+)\s*\}/i);
  if (boxedMatch) {
    const boxedContent = boxedMatch[1].trim().toLowerCase();
    if (boxedContent.includes('ใช่') || boxedContent.includes('yes') || boxedContent.includes('เข้าข่าย')) {
      return 'เข้าข่ายผิด';
    } else if (boxedContent.includes('ไม่ใช่') || boxedContent.includes('no') || boxedContent.includes('ไม่เข้าข่าย')) {
      return 'ไม่ผิด';
    }
  }
  
  // Check for Final Answer section
  const finalAnswerMatch = response.match(/\*\*Final Answer:\*\*\s*([\s\S]*?)(?:\n\n|$)/i);
  if (finalAnswerMatch) {
    const finalContent = finalAnswerMatch[1].trim().toLowerCase();
    if (finalContent.includes('ใช่') || finalContent.includes('yes') || finalContent.includes('เข้าข่าย')) {
      return 'เข้าข่ายผิด';
    } else if (finalContent.includes('ไม่ใช่') || finalContent.includes('no') || finalContent.includes('ไม่เข้าข่าย')) {
      return 'ไม่ผิด';
    }
  }
  
  // Fallback to basic keyword matching
  if (lowerResponse.includes('ใช่') || lowerResponse.includes('yes')) {
    return 'เข้าข่ายผิด';
  } else if (lowerResponse.includes('ไม่ใช่') || lowerResponse.includes('no')) {
    return 'ไม่ผิด';
  }
  
  return 'ไม่สามารถวิเคราะห์ได้';
}

export async function POST(request: NextRequest) {
  try {
    const { transcriptionId, text, overrideResults } = await request.json();

    if (!transcriptionId) {
      return NextResponse.json(
        { error: 'Missing transcriptionId' },
        { status: 400 }
      );
    }

    // Handle override results for manual re-detection
    if (overrideResults) {
      // Update with provided results directly
      const updatedTranscription = await prisma.transcriptionJob.update({
        where: { id: transcriptionId },
        data: {
          // @ts-ignore - Temporary until types are updated
          riskDetectionStatus: 'completed',
          riskDetectionResult: overrideResults.riskResult,
          riskDetectionResponse: overrideResults.ollamaResponse,
          riskAnalyzedAt: new Date()
        }
      });

      return NextResponse.json({
        success: true,
        result: overrideResults.riskResult,
        response: overrideResults.ollamaResponse,
        transcription: updatedTranscription
      });
    }

    if (!text) {
      return NextResponse.json(
        { error: 'Missing text for analysis' },
        { status: 400 }
      );
    }

    // Check if transcription exists
    const transcription = await prisma.transcriptionJob.findUnique({
      where: { id: transcriptionId }
    });

    if (!transcription) {
      return NextResponse.json(
        { error: 'Transcription not found' },
        { status: 404 }
      );
    }

    // Update status to analyzing
    await prisma.transcriptionJob.update({
      where: { id: transcriptionId },
      data: { 
        // @ts-ignore - Temporary until types are updated
        riskDetectionStatus: 'analyzing' 
      }
    });

    try {
      // Call Ollama API
      const ollamaResponse = await callOllamaAPI(text);
      const riskResult = extractRiskResult(ollamaResponse);

      // Update with results
      const updatedTranscription = await prisma.transcriptionJob.update({
        where: { id: transcriptionId },
        data: {
          // @ts-ignore - Temporary until types are updated
          riskDetectionStatus: 'completed',
          riskDetectionResult: riskResult,
          riskDetectionResponse: ollamaResponse,
          riskAnalyzedAt: new Date()
        }
      });

      return NextResponse.json({
        success: true,
        result: riskResult,
        response: ollamaResponse,
        transcription: updatedTranscription
      });

    } catch (ollamaError) {
      // Update status to failed
      await prisma.transcriptionJob.update({
        where: { id: transcriptionId },
        data: { 
          // @ts-ignore - Temporary until types are updated
          riskDetectionStatus: 'failed',
          riskDetectionResponse: ollamaError instanceof Error ? ollamaError.message : 'Unknown error'
        }
      });

      return NextResponse.json(
        { 
          error: 'Risk analysis failed', 
          details: ollamaError instanceof Error ? ollamaError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in detect-risk API:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const transcriptionId = searchParams.get('transcriptionId');

    if (!transcriptionId) {
      return NextResponse.json(
        { error: 'Missing transcriptionId' },
        { status: 400 }
      );
    }

    const transcription = await prisma.transcriptionJob.findUnique({
      where: { id: transcriptionId },
      select: {
        id: true,
        // @ts-ignore - Temporary until types are updated
        riskDetectionStatus: true,
        riskDetectionResult: true,
        riskDetectionResponse: true,
        riskAnalyzedAt: true
      }
    });

    if (!transcription) {
      return NextResponse.json(
        { error: 'Transcription not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      riskDetection: {
        // @ts-ignore - Temporary until types are updated
        status: transcription.riskDetectionStatus,
        // @ts-ignore - Temporary until types are updated  
        result: transcription.riskDetectionResult,
        // @ts-ignore - Temporary until types are updated
        response: transcription.riskDetectionResponse,
        // @ts-ignore - Temporary until types are updated
        analyzedAt: transcription.riskAnalyzedAt
      }
    });

  } catch (error) {
    console.error('Error in detect-risk GET API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
