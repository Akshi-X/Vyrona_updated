import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Header from '../components/Header'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('Header', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  describe('Rendering', () => {
    it('renders title', () => {
      render(
        <MemoryRouter>
          <Header title="Test Title" />
        </MemoryRouter>
      )
      expect(screen.getByText('Test Title')).toBeInTheDocument()
    })

    it('renders back button by default', () => {
      render(
        <MemoryRouter>
          <Header title="Test Title" />
        </MemoryRouter>
      )
      const backButton = screen.getByLabelText('Back')
      expect(backButton).toBeInTheDocument()
    })

    it('hides back button when showBackButton is false', () => {
      render(
        <MemoryRouter>
          <Header title="Test Title" showBackButton={false} />
        </MemoryRouter>
      )
      expect(screen.queryByLabelText('Back')).not.toBeInTheDocument()
    })

    it('renders rightContent when provided', () => {
      render(
        <MemoryRouter>
          <Header title="Test Title" rightContent={<button>Action</button>} />
        </MemoryRouter>
      )
      expect(screen.getByText('Action')).toBeInTheDocument()
    })

    it('does not render rightContent when not provided', () => {
      render(
        <MemoryRouter>
          <Header title="Test Title" />
        </MemoryRouter>
      )
      expect(screen.queryByText('Action')).not.toBeInTheDocument()
    })

    it('applies custom className', () => {
      const { container } = render(
        <MemoryRouter>
          <Header title="Test Title" className="custom-class" />
        </MemoryRouter>
      )
      const header = container.querySelector('.custom-class')
      expect(header).toBeInTheDocument()
    })

    it('applies offsetLeft style', () => {
      const { container } = render(
        <MemoryRouter>
          <Header title="Test Title" offsetLeft="15rem" />
        </MemoryRouter>
      )
      const header = container.firstChild as HTMLElement
      expect(header).toHaveStyle({ left: '15rem' })
    })

    it('uses default offsetLeft when not provided', () => {
      const { container } = render(
        <MemoryRouter>
          <Header title="Test Title" />
        </MemoryRouter>
      )
      const header = container.firstChild as HTMLElement
      expect(header).toHaveStyle({ left: '0px' })
    })
  })

  describe('Navigation', () => {
    it('calls navigate(-1) when back button is clicked and no onBackClick provided', async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <Header title="Test Title" />
        </MemoryRouter>
      )
      
      const backButton = screen.getByLabelText('Back')
      await user.click(backButton)
      
      expect(mockNavigate).toHaveBeenCalledWith(-1)
    })

    it('calls onBackClick when provided and back button is clicked', async () => {
      const user = userEvent.setup()
      const mockOnBackClick = vi.fn()
      
      render(
        <MemoryRouter>
          <Header title="Test Title" onBackClick={mockOnBackClick} />
        </MemoryRouter>
      )
      
      const backButton = screen.getByLabelText('Back')
      await user.click(backButton)
      
      expect(mockOnBackClick).toHaveBeenCalledTimes(1)
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  describe('Structure', () => {
    it('renders with correct structure and classes', () => {
      const { container } = render(
        <MemoryRouter>
          <Header title="Test Title" />
        </MemoryRouter>
      )
      
      const header = container.firstChild as HTMLElement
      expect(header).toHaveClass('w-full', 'fixed', 'top-0', 'left-0', 'right-0', 'z-[100]', 'bg-black', 'h-[63px]')
    })

    it('renders title with correct styling', () => {
      render(
        <MemoryRouter>
          <Header title="Test Title" />
        </MemoryRouter>
      )
      
      const title = screen.getByText('Test Title')
      expect(title).toHaveClass('text-xs', 'sm:text-sm', 'font-medium', 'text-white')
    })

    it('handles empty title gracefully', () => {
      const { container } = render(
        <MemoryRouter>
          <Header title="" />
        </MemoryRouter>
      )
      
      // Title should not be rendered if empty - check that no title span exists
      const titleSpan = container.querySelector('.text-xs.sm\\:text-sm.font-medium.text-white')
      expect(titleSpan).not.toBeInTheDocument()
    })
  })
})

