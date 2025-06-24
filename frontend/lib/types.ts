export interface Word {
  text: string
  start: number
  end: number
  confidence: number
}

export interface Segment {
  id: number
  seek?: number
  start: number
  end: number
  text: string
  tokens?: number[]
  temperature?: number
  avg_logprob?: number
  compression_ratio?: number
  no_speech_prob?: number
  confidence: number
  words: Word[]
}

export interface TranscriptionResult {
  text: string
  segments: Segment[]
  language?: string
}

export interface TranscriptionJob {
  id: string
  title: string
  description: string | null
  originalAudioFileName: string
  status: string
  transcriptionResultJson: TranscriptionResult | null
  createdAt: Date
  updatedAt: Date
}
