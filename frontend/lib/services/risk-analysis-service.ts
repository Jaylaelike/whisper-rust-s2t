// Service to handle risk analysis synchronization between backend queue and frontend database

export interface RiskAnalysisResult {
  is_risky: boolean
  confidence?: number
  raw_response?: string
  detected_keywords?: string[]
}

export class RiskAnalysisService {
  private static instance: RiskAnalysisService
  private baseUrl: string

  constructor(baseUrl: string = 'http://localhost:8000') {
    this.baseUrl = baseUrl
  }

  static getInstance(): RiskAnalysisService {
    if (!RiskAnalysisService.instance) {
      RiskAnalysisService.instance = new RiskAnalysisService()
    }
    return RiskAnalysisService.instance
  }

  // Submit text for risk analysis via backend API
  async submitRiskAnalysis(text: string, priority: number = 0): Promise<{ task_id: string }> {
    const response = await fetch(`${this.baseUrl}/api/risk-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        priority
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Risk analysis submission failed')
    }

    return response.json()
  }

  // Get task status from backend
  async getTaskStatus(taskId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/task/${taskId}/status`)
    
    if (!response.ok) {
      throw new Error('Failed to get task status')
    }

    return response.json()
  }

  // Update transcription record with risk analysis result
  async updateTranscriptionRiskStatus(
    transcriptionId: string, 
    status: 'analyzing' | 'completed' | 'failed',
    result?: RiskAnalysisResult,
    taskId?: string
  ): Promise<void> {
    const updateData: any = {
      riskDetectionStatus: status,
      updatedAt: new Date().toISOString()
    }

    if (taskId) {
      updateData.taskId = taskId
    }

    if (status === 'completed' && result) {
      updateData.riskDetectionResult = result.is_risky ? 'risky' : 'safe'
      updateData.riskDetectionResponse = result.raw_response || JSON.stringify(result)
      updateData.riskConfidence = result.confidence
      updateData.riskAnalyzedAt = new Date().toISOString()
    }

    const response = await fetch(`/api/transcriptions/${transcriptionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData)
    })

    if (!response.ok) {
      throw new Error('Failed to update transcription risk status')
    }
  }

  // Convert backend result format to display format
  static formatRiskResult(result: string | undefined): 'risky' | 'safe' | 'unknown' {
    if (!result) return 'unknown'
    
    const lowerResult = result.toLowerCase()
    
    // Handle Thai responses
    if (lowerResult.includes('เข้าข่ายผิด') || lowerResult.includes('ผิดกฎหมาย')) {
      return 'risky'
    }
    
    if (lowerResult.includes('ไม่ผิด') || lowerResult.includes('ไม่เข้าข่าย') || lowerResult.includes('ไม่มีความเสี่ยง')) {
      return 'safe'
    }

    // Handle English responses
    if (lowerResult.includes('risky') || lowerResult.includes('illegal') || lowerResult.includes('violation')) {
      return 'risky'
    }

    if (lowerResult.includes('safe') || lowerResult.includes('legal') || lowerResult.includes('no risk')) {
      return 'safe'
    }

    return 'unknown'
  }

  // Get Thai display text for risk status
  static getRiskDisplayText(status: 'risky' | 'safe' | 'unknown'): string {
    switch (status) {
      case 'risky':
        return 'มีความเสี่ยง'
      case 'safe':
        return 'ไม่มีความเสี่ยง'
      default:
        return 'ไม่ทราบ'
    }
  }
}

export default RiskAnalysisService
