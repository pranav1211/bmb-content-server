'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function ViewImagesPage() {
  const [images, setImages] = useState([])
  const [filteredImages, setFilteredImages] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState('movietv')
  const [selectedSubCategory, setSelectedSubCategory] = useState('all')
  const [loading, setLoading] = useState(true)

  const imagesPerPage = 10
  const imagesPerRow = 5

  // Category structure based on your folder structure
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

  // Load images from the actual file system
  const loadImages = async () => {
    setLoading(true)
    
    try {
      const response = await fetch('/api/images')
      const data = await response.json()
      
      if (data.success) {
        setImages(data.images)
        setFilteredImages(data.images)
      } else {
        console.error('Failed to load images:', data.error)
        setImages([])
        setFilteredImages([])
      }
    } catch (error) {
      console.error('Error loading images:', error)
      setImages([])
      setFilteredImages([])
    }
    
    setLoading(false)
  }

  useEffect(() => {
    loadImages()
  }, [])

  // Filter images based on selected category and subcategory
  useEffect(() => {
    let filtered = images

    // Always filter by category (no "all" option)
    filtered = filtered.filter(img => img.category === selectedCategory)

    if (selectedSubCategory !== 'all') {
      filtered = filtered.filter(img => img.subcategory === selectedSubCategory)
    }

    // Sort images in reverse order with proper numerical sorting
    filtered = filtered.sort((a, b) => {
      // Extract filename without extension for comparison
      const nameA = a.name.toLowerCase()
      const nameB = b.name.toLowerCase()
      
      // Use localeCompare with numeric option for proper number sorting
      return nameB.localeCompare(nameA, undefined, { 
        numeric: true, 
        sensitivity: 'base' 
      })
    })

    setFilteredImages(filtered)
    setCurrentPage(1) // Reset to first page when filters change
  }, [selectedCategory, selectedSubCategory, images])

  // Get current page images
  const indexOfLastImage = currentPage * imagesPerPage
  const indexOfFirstImage = indexOfLastImage - imagesPerPage
  const currentImages = filteredImages.slice(indexOfFirstImage, indexOfLastImage)

  // Calculate total pages
  const totalPages = Math.ceil(filteredImages.length / imagesPerPage)

  const handleCategoryChange = (category) => {
    setSelectedCategory(category)
    setSelectedSubCategory('all')
  }

  const getImageUrl = (path) => `https://bmb-content-server.vercel.app/${path}`

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text)
      console.log(`${type} copied to clipboard: ${text}`)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
  }

  const getSubcategories = () => {
    return categories[selectedCategory]?.subcategories || []
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">View Images</h1>
            <p className="text-gray-600 mt-2">Browse your image collection</p>
          </div>
          <Link href="/" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Back to Home
          </Link>
        </div>

        {/* Category Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Main Categories */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Category</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(categories).map(([key, category]) => (
                  <button
                    key={key}
                    onClick={() => handleCategoryChange(key)}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      selectedCategory === key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Subcategories */}
            {getSubcategories().length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Subcategory</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedSubCategory('all')}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      selectedSubCategory === 'all'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All Subcategories
                  </button>
                  {getSubcategories().map((subcategory) => (
                    <button
                      key={subcategory}
                      onClick={() => setSelectedSubCategory(subcategory)}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        selectedSubCategory === subcategory
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {subcategory.charAt(0).toUpperCase() + subcategory.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Results Count */}
          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredImages.length} images in {categories[selectedCategory]?.name}
            {selectedSubCategory !== 'all' && ` - ${selectedSubCategory}`}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading images...</p>
          </div>
        )}

        {/* Images Grid */}
        {!loading && (
          <>
            <div className="grid grid-cols-5 gap-4 mb-8">
              {currentImages.map((image) => (
                <div
                  key={image.id}
                  className="group relative bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-all duration-300"
                >
                  {/* Image Container */}
                  <div className="aspect-video relative overflow-hidden">
                    <Image
                      src={getImageUrl(image.path)}
                      alt={image.name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 20vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        // Fallback to placeholder if image fails to load
                        e.target.style.display = 'none'
                        e.target.nextSibling.style.display = 'flex'
                      }}
                    />
                    {/* Fallback placeholder */}
                    <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 items-center justify-center hidden">
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black bg-opacity-70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-center items-center p-4">
                      <div className="text-center text-white">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            copyToClipboard(image.name, 'Image name')
                          }}
                          className="font-semibold text-sm mb-2 break-words hover:text-blue-300 transition-colors cursor-pointer border-b border-transparent hover:border-blue-300"
                        >
                          {image.name}
                        </button>
                        <div className="text-xs break-all">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              copyToClipboard(getImageUrl(image.path), 'Image URL')
                            }}
                            className="text-blue-300 hover:text-blue-200 transition-colors cursor-pointer border-b border-transparent hover:border-blue-200"
                          >
                            {getImageUrl(image.path)}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">
                        {categories[image.category]?.name}
                        {image.subcategory && ` • ${image.subcategory}`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Empty State */}
            {currentImages.length === 0 && !loading && (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No images found</h3>
                <p className="text-gray-600">Try adjusting your filters or check back later.</p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center space-x-4">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                    currentPage === 1
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg transform hover:-translate-y-0.5'
                  }`}
                >
                  ← Previous
                </button>
                
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600 font-medium">
                    Page {currentPage} of {totalPages}
                  </span>
                  <span className="text-sm text-gray-500">
                    ({filteredImages.length} images)
                  </span>
                </div>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                    currentPage === totalPages
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg transform hover:-translate-y-0.5'
                  }`}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}