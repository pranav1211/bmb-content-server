import { promises as fs } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

export async function GET(request, { params }) {
  try {
    const imagePath = params.path.join('/')
    const decodedPath = decodeURIComponent(imagePath)
    const fullPath = path.join(process.cwd(), 'public', decodedPath)
    
    // Security check - make sure the path is within public directory
    const publicDir = path.join(process.cwd(), 'public')
    if (!fullPath.startsWith(publicDir)) {
      return new NextResponse('Forbidden', { status: 403 })
    }
    
    try {
      const imageBuffer = await fs.readFile(fullPath)
      const extension = path.extname(fullPath).toLowerCase()
      
      // Set appropriate content type
      let contentType = 'image/jpeg' // default
      switch (extension) {
        case '.png':
          contentType = 'image/png'
          break
        case '.gif':
          contentType = 'image/gif'
          break
        case '.webp':
          contentType = 'image/webp'
          break
        case '.svg':
          contentType = 'image/svg+xml'
          break
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg'
          break
      }
      
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      })
      
    } catch (error) {
      return new NextResponse('Image not found', { status: 404 })
    }
    
  } catch (error) {
    console.error('Error serving image:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}