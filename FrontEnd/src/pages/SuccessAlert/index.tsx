import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from '../../components/Header';

interface SuccessAlertProps {
  title?: string;
  message?: string;
  buttonText?: string;
  onButtonClick?: () => void;
}

const SuccessAlert: React.FC<SuccessAlertProps> = ({
  title = "Thank You!",
  message = "Thank you for submitting your feedback. A member of our team will be in touch shortly. You can track your past tickets in the 'Support' section of your dashboard.",
  buttonText = "Return to Dashboard",
  onButtonClick
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get ticket ID from location state if available
  const ticketId = location.state?.ticketId;
  const ticketNumber = location.state?.ticketNumber;

  const handleButtonClick = () => {
    if (onButtonClick) {
      onButtonClick();
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Success" showBackButton={false} />
      
      <div className="flex items-center justify-center min-h-screen" style={{ paddingTop: 'calc(63px + 1rem)' }}>
        <div className="bg-white rounded-lg shadow-lg p-12 max-w-2xl w-full mx-4">
          {/* Success Icon */}
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-green-500 rounded-lg flex items-center justify-center">
              <svg 
                className="w-8 h-8 text-white" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth="3" 
                  d="M5 13l4 4L19 7" 
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-6">
            {title}
          </h1>

          {/* Message */}
          <p className="text-gray-600 text-center mb-10 leading-relaxed">
            {message}
          </p>

          {/* Ticket ID Display (if available) */}
          {ticketId && (
            <div className="bg-gray-50 rounded-lg p-6 mb-8">
              <p className="text-sm text-gray-600 text-center">
                <span className="font-medium">Ticket ID:</span> {ticketNumber || ticketId}
              </p>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleButtonClick}
            className="w-full bg-[#6b1176] text-white py-4 px-6 rounded-lg font-medium hover:bg-[#8a2a95] transition-colors duration-200"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuccessAlert;
