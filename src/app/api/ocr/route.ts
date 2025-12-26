import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const imageFile = formData.get('image') as File

    if (!imageFile) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      )
    }

    // Check if Google Vision API key is configured
    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY
    
    if (!apiKey) {
      // Fallback: Return error suggesting manual entry
      return NextResponse.json(
        { 
          error: 'OCR service not configured. Please use manual entry.',
          requiresSetup: true
        },
        { status: 503 }
      )
    }

    // Convert file to base64
    const arrayBuffer = await imageFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64Image = buffer.toString('base64')

    // Call Google Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image,
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                  maxResults: 1,
                },
              ],
            },
          ],
        }),
      }
    )

    if (!visionResponse.ok) {
      const errorData = await visionResponse.json()
      console.error('Google Vision API error:', errorData)
      return NextResponse.json(
        { error: 'OCR processing failed. Please try manual entry.', details: errorData.error?.message },
        { status: visionResponse.status }
      )
    }

    const visionData = await visionResponse.json()

    // Extract text and word bounding boxes
    const textAnnotations = visionData.responses[0]?.textAnnotations || []
    const fullText = textAnnotations[0]?.description || ''
    
    // Extract word-level data for structured parsing
    const words: Array<{
      text: string
      bbox: { x0: number; y0: number; x1: number; y1: number }
    }> = []

    if (textAnnotations.length > 1) {
      // Skip first element (full text), process individual words
      textAnnotations.slice(1).forEach((annotation: any) => {
        const vertices = annotation.boundingPoly?.vertices || []
        if (vertices.length >= 2) {
          words.push({
            text: annotation.description || '',
            bbox: {
              x0: vertices[0].x || 0,
              y0: vertices[0].y || 0,
              x1: vertices[2]?.x || vertices[1]?.x || 0,
              y1: vertices[2]?.y || vertices[1]?.y || 0,
            },
          })
        }
      })
    }

    // Extract all numbers for reference
    const allNumbers: number[] = []
    const numberPattern = /(\d{1,3})/g
    let match
    while ((match = numberPattern.exec(fullText)) !== null) {
      const num = parseInt(match[1])
      if (!isNaN(num) && num >= 0 && num <= 300) {
        allNumbers.push(num)
      }
    }

    return NextResponse.json({
      text: fullText,
      words,
      allNumbers,
    })
  } catch (error: any) {
    console.error('OCR API error:', error)
    return NextResponse.json(
      { error: 'OCR processing failed', details: error.message },
      { status: 500 }
    )
  }
}

