import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('audioFile') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Validate file type
    if (!file.type.includes('audio')) {
      return NextResponse.json({ error: 'File must be an audio file' }, { status: 400 })
    }

    // Generate unique filename to avoid conflicts
    const fileExtension = file.name.split('.').pop() || 'mp3'
    const uniqueFilename = `${randomUUID()}.${fileExtension}`
    
    // Create upload directory if it doesn't exist
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'audio')
    await mkdir(uploadDir, { recursive: true })
    
    // Save file to public/uploads/audio/
    const filePath = join(uploadDir, uniqueFilename)
    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))
    
    // Return the public URL path
    const publicPath = `/uploads/audio/${uniqueFilename}`
    
    return NextResponse.json({
      success: true,
      filePath: publicPath,
      originalName: file.name,
      size: file.size,
      type: file.type
    })
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
