import { promises as fs } from 'fs'
import path from 'path'

export async function GET() {
  try {
    const publicPath = path.join(process.cwd(), 'public')
    const images = []

    // Define your folder structure
    const categories = {
      movietv: {
        name: 'Movie/TV',
        subcategories: ['movie', 'tv']
      },
      f1: {
        name: 'F1', 
        subcategories: ['2025', 'general']
      },
      experience: {
        name: 'Experience',
        subcategories: []
      },
      tech: {
        name: 'Tech',
        subcategories: []
      }
    }

    // Image extensions to look for
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']

    let imageId = 1

    for (const [categoryKey, categoryData] of Object.entries(categories)) {
      const categoryPath = path.join(publicPath, categoryKey)
      
      try {
        // Check if category folder exists
        await fs.access(categoryPath)
        
        if (categoryData.subcategories.length > 0) {
          // Category has subcategories
          for (const subcategory of categoryData.subcategories) {
            const subcategoryPath = path.join(categoryPath, subcategory)
            
            try {
              await fs.access(subcategoryPath)
              const files = await fs.readdir(subcategoryPath)
              
              for (const file of files) {
                const fileExtension = path.extname(file).toLowerCase()
                if (imageExtensions.includes(fileExtension)) {
                  const imagePath = `${categoryKey}/${subcategory}/${file}`
                  images.push({
                    id: imageId++,
                    name: file,
                    category: categoryKey,
                    subcategory: subcategory,
                    path: imagePath
                  })
                }
              }
            } catch (error) {
              console.log(`Subcategory folder ${subcategory} not found in ${categoryKey}`)
            }
          }
        } else {
          // Category has no subcategories - scan directly
          const files = await fs.readdir(categoryPath)
          
          for (const file of files) {
            const filePath = path.join(categoryPath, file)
            const stat = await fs.stat(filePath)
            
            if (stat.isFile()) {
              const fileExtension = path.extname(file).toLowerCase()
              if (imageExtensions.includes(fileExtension)) {
                const imagePath = `${categoryKey}/${file}`
                images.push({
                  id: imageId++,
                  name: file,
                  category: categoryKey,
                  subcategory: null,
                  path: imagePath
                })
              }
            }
          }
        }
      } catch (error) {
        console.log(`Category folder ${categoryKey} not found`)
      }
    }

    return Response.json({ 
      success: true, 
      images,
      total: images.length 
    })
    
  } catch (error) {
    console.error('Error scanning images:', error)
    return Response.json({ 
      success: false, 
      error: 'Failed to scan images',
      images: []
    }, { status: 500 })
  }
}