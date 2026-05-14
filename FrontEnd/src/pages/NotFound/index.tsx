import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()

  const handleGoHome = () => {
    navigate('/dashboard')
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">404 - Not Found</h1>
      <p className="mt-2">The page you are looking for does not exist.</p>
      <button 
        onClick={handleGoHome}
        className="text-blue-600 underline mt-4 inline-block cursor-pointer hover:text-blue-800"
      >
        Go Home
      </button>
    </div>
  )
}



