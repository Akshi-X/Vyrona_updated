import React from 'react';
import { useNavigate } from 'react-router-dom';
 

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  onBackClick?: () => void;
  rightContent?: React.ReactNode;
  className?: string;
  offsetLeft?: string; // e.g., '15rem' to avoid sidebar collision
}

const Header: React.FC<HeaderProps> = ({ 
  title, 
  showBackButton = true, 
  onBackClick,
  rightContent,
  className,
  offsetLeft
}) => {
  const navigate = useNavigate();

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      navigate(-1); // Go back to previous page
    }
  };

  const leftOffset = offsetLeft || '0px';

  return (
    <div 
      className={`w-full fixed top-0 left-0 right-0 z-[100] pointer-events-auto bg-white h-[63px] flex items-center justify-between px-6 gap-6 flex-shrink-0 border-b border-gray-200 shadow-sm ${className || ''}`}
      style={{ left: leftOffset, width: `calc(100% - ${leftOffset})` }}
    >
      <div className="flex items-center">
        {showBackButton && (
          <button 
            className="mr-3 p-1 hover:bg-gray-100 rounded-full transition-colors" 
            aria-label="Back"
            onClick={handleBackClick}
          >
            <svg className="h-5 w-5 text-gray-900" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {title ? (
          <span className="text-xs sm:text-sm font-medium text-gray-900">{title}</span>
        ) : null}
      </div>
      {rightContent && (
        <div className="flex items-center">
          {rightContent}
        </div>
      )}
    </div>
  );
};

export default Header;
