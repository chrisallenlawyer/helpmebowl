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
                  type: 'DOCUMENT_TEXT_DETECTION', // Better for structured documents like scorecards
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
      confidence?: number
    }> = []

    if (textAnnotations.length > 1) {
      // Skip first element (full text), process individual words
      textAnnotations.slice(1).forEach((annotation: any) => {
        const vertices = annotation.boundingPoly?.vertices || []
        if (vertices.length >= 2) {
          // Calculate bounding box from vertices
          const xCoords = vertices.map((v: any) => v.x || 0).filter((x: number) => x > 0)
          const yCoords = vertices.map((v: any) => v.y || 0).filter((y: number) => y > 0)
          
          words.push({
            text: annotation.description || '',
            bbox: {
              x0: Math.min(...xCoords),
              y0: Math.min(...yCoords),
              x1: Math.max(...xCoords),
              y1: Math.max(...yCoords),
            },
            confidence: annotation.confidence,
          })
        }
      })
    }

    // Also extract blocks, paragraphs, and words from fullTextAnnotation if available
    // This gives us better structure for scorecards
    const fullTextAnnotation = visionData.responses[0]?.fullTextAnnotation
    const blocks = fullTextAnnotation?.pages?.[0]?.blocks || []
    const paragraphs: Array<{
      text: string
      bbox: { x0: number; y0: number; x1: number; y1: number }
    }> = []
    
    blocks.forEach((block: any) => {
      block.paragraphs?.forEach((para: any) => {
        const vertices = para.boundingBox?.vertices || []
        if (vertices.length >= 2) {
          const xCoords = vertices.map((v: any) => v.x || 0).filter((x: number) => x > 0)
          const yCoords = vertices.map((v: any) => v.y || 0).filter((y: number) => y > 0)
          
          let paraText = ''
          para.words?.forEach((word: any) => {
            paraText += (word.symbols || []).map((s: any) => s.text || '').join('') + ' '
          })
          
          paragraphs.push({
            text: paraText.trim(),
            bbox: {
              x0: Math.min(...xCoords),
              y0: Math.min(...yCoords),
              x1: Math.max(...xCoords),
              y1: Math.max(...yCoords),
            },
          })
        }
      })
    })

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
      paragraphs, // Structured paragraphs with bounding boxes
      allNumbers,
      rawResponse: visionData, // Include full response for debugging
    })
  } catch (error: any) {
    console.error('OCR API error:', error)
    return NextResponse.json(
      { error: 'OCR processing failed', details: error.message },
      { status: 500 }
    )
  }
}



