import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Beyond me Btw content server
          </h1>
          <p className="text-lg text-gray-600">
            Manage and view your image content
          </p>
        </div>

        {/* Main Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Add Image Section */}
          <div className="bg-white rounded-lg shadow-md p-8 hover:shadow-lg transition-shadow">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Add Image</h2>
              <p className="text-gray-600 mb-6">
                Upload new images to your content server
              </p>
              <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors cursor-not-allowed opacity-50">
                Coming Soon
              </button>
            </div>
          </div>

          {/* View Images Section */}
          <div className="bg-white rounded-lg shadow-md p-8 hover:shadow-lg transition-shadow">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">View Images</h2>
              <p className="text-gray-600 mb-6">
                Browse and manage your existing image collection
              </p>
              <Link href="/view-images">
                <button className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors">
                  Browse Images
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Stats or Additional Info */}
        <div className="mt-12 text-center">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Content Categories</h3>
            <div className="flex flex-wrap justify-center gap-4">
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">Movie/TV</span>
              <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm">F1</span>
              <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm">Experience</span>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">Tech</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}