/**
 * Phase 6 frontend tests: AI analyst chat, interviewer flow and dashboard
 * insight cards. Services are mocked at the module boundary — no network.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as aiService from '@/services/aiService';
import * as interviewService from '@/services/interviewService';
import { AnalystPage } from '@/pages/AnalystPage';
import { InterviewPage } from '@/pages/InterviewPage';
import { AIInsightCards } from '@/components/AIInsightCards';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});

const CHAT_REPLY: aiService.AIChatResponse = {
  conversationId: 'conv1',
  message: {
    role: 'assistant',
    content: 'Based on your repositories, Python is your strongest technology.',
    timestamp: '2026-09-28T12:00:00.000Z'
  }
};

const FIRST_QUESTION: interviewService.InterviewQuestionPayload = {
  sessionId: 's1',
  status: 'IN_PROGRESS',
  currentQuestion: 1,
  questionCount: 2,
  question: 'Walk me through the architecture of Smart-traffic-ai.',
  category: 'SYSTEM DESIGN',
  difficulty: 'MEDIUM',
  relatedSkills: ['Python']
};

const EVALUATION: interviewService.InterviewEvaluation = {
  score: 70,
  feedback: 'Good structure; tie claims to specific evidence.',
  strengths: ['Clear framing'],
  knowledgeGaps: ['Testing strategy'],
  improvedAnswer: 'Mention how you validated the model outputs.'
};

const REPORT: interviewService.InterviewReportPayload = {
  sessionId: 's1',
  status: 'COMPLETED',
  overallScore: 70,
  finalReport: {
    summary: 'Solid fundamentals with room to grow in testing.',
    strengths: ['Clear communication'],
    knowledgeGaps: ['Automated testing'],
    improvedAnswers: [],
    nextSteps: ['Add tests to Smart-traffic-ai']
  }
};

const SESSIONS: interviewService.InterviewSessionSummary[] = [
  {
    _id: 's1',
    targetRole: 'Python Developer',
    interviewType: 'TECHNICAL',
    difficulty: 'MEDIUM',
    status: 'COMPLETED',
    questionCount: 2,
    overallScore: 70,
    createdAt: '2026-09-28T10:00:00.000Z'
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(aiService, 'fetchConversations').mockResolvedValue({ conversations: [] });
  vi.spyOn(aiService, 'fetchInsight').mockRejectedValue(new Error('AI unavailable'));
});

describe('AnalystPage', () => {
  it('shows the empty state with suggested questions', async () => {
    render(
      <MemoryRouter>
        <AnalystPage />
      </MemoryRouter>
    );
    expect(await screen.findByText(/ask me about your developer dna/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'What are my strongest technologies?' })).toBeInTheDocument();
  });

  it('sends a message and renders the grounded assistant reply', async () => {
    const sendSpy = vi.spyOn(aiService, 'sendChatMessage').mockResolvedValue(CHAT_REPLY);
    render(
      <MemoryRouter>
        <AnalystPage />
      </MemoryRouter>
    );
    const input = await screen.findByPlaceholderText(/ask about your skills/i);
    fireEvent.change(input, { target: { value: 'What are my strongest technologies?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText(/python is your strongest technology/i)).toBeInTheDocument();
    expect(sendSpy).toHaveBeenCalledWith('What are my strongest technologies?', undefined);
  });

  it('surfaces an honest error when the AI layer is unavailable', async () => {
    vi.spyOn(aiService, 'sendChatMessage').mockRejectedValue(
      new aiService.ApiRequestError('AI is not configured', 'SERVICE_UNAVAILABLE', 503)
    );
    render(
      <MemoryRouter>
        <AnalystPage />
      </MemoryRouter>
    );
    const input = await screen.findByPlaceholderText(/ask about your skills/i);
    fireEvent.change(input, { target: { value: 'Hello?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/AI is not configured/i);
  });
});

describe('InterviewPage', () => {
  it('renders the setup form with Phase 5 roles and history', async () => {
    vi.spyOn(interviewService, 'listInterviews').mockResolvedValue({ sessions: SESSIONS });
    render(
      <MemoryRouter>
        <InterviewPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('AI Interviewer')).toBeInTheDocument();
    expect(screen.getByLabelText('Target role')).toBeInTheDocument();
    // 'Python Developer' appears both as a role option and in history.
    expect(screen.getAllByText('Python Developer').length).toBeGreaterThan(0);
    expect(screen.getByText('score 70')).toBeInTheDocument();
  });

  it('runs the question flow: start, answer, evaluation, auto-complete report', async () => {
    vi.spyOn(interviewService, 'listInterviews').mockResolvedValue({ sessions: [] });
    vi.spyOn(interviewService, 'createInterview').mockResolvedValue({ sessionId: 's1', status: 'NOT_STARTED' });
    vi.spyOn(interviewService, 'startInterview').mockResolvedValue(FIRST_QUESTION);
    const answerSpy = vi
      .spyOn(interviewService, 'answerInterview')
      .mockResolvedValueOnce({ ...FIRST_QUESTION, currentQuestion: 2, evaluation: EVALUATION })
      .mockResolvedValueOnce({ ...FIRST_QUESTION, status: 'COMPLETED', currentQuestion: 2, evaluation: EVALUATION });
    const completeSpy = vi.spyOn(interviewService, 'completeInterview').mockResolvedValue(REPORT);

    render(
      <MemoryRouter>
        <InterviewPage />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText('Target role'), { target: { value: 'Python Developer' } });
    fireEvent.click(screen.getByRole('button', { name: /start interview/i }));

    expect(await screen.findByText(/walk me through the architecture/i)).toBeInTheDocument();

    const answerBox = screen.getByPlaceholderText(/type your answer/i);
    fireEvent.change(answerBox, { target: { value: 'I used a microservice design with a traffic model.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    // Evaluation feedback appears with the adaptive next question.
    expect(await screen.findByText(/feedback on your last answer/i)).toBeInTheDocument();
    expect(screen.getByText(/good structure/i)).toBeInTheDocument();

    // Second answer completes the interview and shows the final report.
    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'And I validated outputs.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(await screen.findByText('Interview report')).toBeInTheDocument();
    expect(screen.getByText(/solid fundamentals/i)).toBeInTheDocument();
    expect(answerSpy).toHaveBeenCalledTimes(2);
    expect(completeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('AIInsightCards', () => {
  const INSIGHT: aiService.AIInsightResponse = {
    insight: {
      summary: 'Repeated Python usage across your repositories.',
      strengths: [{ skill: 'Python', evidence: '3 repositories use Python as the primary language.' }],
      recommendations: ['Build a production-style API project.']
    },
    cached: false,
    sourceDataVersion: 'v1',
    generatedAt: '2026-09-28T12:00:00.000Z',
    disclaimer: 'AI-generated analysis based on your DevDNA data.'
  };

  it('renders insight cards with the product disclaimer', async () => {
    vi.spyOn(aiService, 'fetchInsight').mockResolvedValue(INSIGHT);
    render(<AIInsightCards />);

    expect(await screen.findByText('AI strength insight')).toBeInTheDocument();
    expect(screen.getByText('AI improvement insight')).toBeInTheDocument();
    // The disclaimer renders once per card.
    expect(screen.getAllByText(/AI-generated analysis based on your DevDNA data/i).length).toBeGreaterThan(0);
  });

  it('stays hidden when AI is unavailable (dashboard degrades silently)', async () => {
    vi.spyOn(aiService, 'fetchInsight').mockRejectedValue(new Error('not configured'));
    const { container } = render(<AIInsightCards />);
    await waitFor(() => {
      expect(container.querySelector('section[aria-label="AI insights"]')).toBeNull();
    });
  });
});
