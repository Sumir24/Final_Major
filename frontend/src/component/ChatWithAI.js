import React, { useState, useEffect, useRef } from 'react';

const ChatWithAI = ({ isOpen, onClose, context }) => {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hello! I am BullPeak AI. How can I help you with your trading strategy or indicators today?' }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // External Trigger Sync
    useEffect(() => {
        if (context?.trigger) {
            handleSendMessage(null, context.trigger);
        }
    }, [context?.trigger]);

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSendMessage = async (e, forcedContent = null) => {
        if (e) e.preventDefault();
        const content = forcedContent || inputValue;
        if (!content.trim() || isLoading) return;

        const userMessage = { role: 'user', content: content };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
                    context: context // Pass current code and config to AI
                }),
            });

            const data = await response.json();

            if (data.error) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Error: ${data.details || data.error}`
                }]);
            } else {
                const aiResponse = data.choices[0].message.content;
                setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Failed to connect to the AI service. Please check your connection and ensure the backend server is running.'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    // Simple markdown-ish formatter for code blocks and system logs
    const formatMessage = (content) => {
        const parts = content.split(/(```[\s\S]*?```)/g);
        return parts.map((part, index) => {
            if (part.startsWith('```')) {
                const isPython = part.includes('python');
                const code = part.replace(/```(\w+)?\n?/, '').replace(/```$/, '');
                return (
                    <pre key={index} className="code-block">
                        <div className="code-header">
                            <span>{isPython ? 'PYTHON CODE' : 'TERMINAL LOG'}</span>
                        </div>
                        <code>{code}</code>
                        <button
                            className="copy-btn"
                            onClick={() => navigator.clipboard.writeText(code)}
                            title="Copy code"
                        >
                            <span className="material-symbols-outlined">content_copy</span>
                        </button>
                    </pre>
                );
            }
            // Handle newlines in plan text
            return part.split('\n').map((line, i) => <p key={`${index}-${i}`}>{line}</p>);
        });
    };

    return (
        <div className={`chat-ai-sidebar ${isOpen ? 'open' : 'closed'}`}>
            <div className="chat-header">
                <div className="header-info">
                    <span className="material-symbols-outlined ai-icon">smart_toy</span>
                    <div className="ai-title-group">
                        <h3>BullPeak AI</h3>
                        <div className="status-pill">
                            <span className="status-indicator online"></span>
                            <span className="status-text">Online</span>
                        </div>
                    </div>
                </div>
                <button className="sidebar-action-btn" onClick={onClose} title="Collapse Sidebar">
                    <span className="material-symbols-outlined">chevron_right</span>
                </button>
            </div>

            <div className="chat-messages">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`message-bubble ${msg.role}`}>
                        {msg.role === 'assistant' && (
                            <div className="avatar-mini">
                                <span className="material-symbols-outlined">smart_toy</span>
                            </div>
                        )}
                        <div className="message-content">
                            {formatMessage(msg.content)}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="message-bubble assistant loading">
                        <div className="avatar-mini">
                            <span className="material-symbols-outlined pulse-icon">smart_toy</span>
                        </div>
                        <div className="typing-indicator">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-wrapper">
                <form className="chat-input-area" onSubmit={handleSendMessage}>
                    <textarea
                        placeholder="Ask about indicators, strategies..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage(e);
                            }
                        }}
                    />
                    <button type="submit" className="send-btn" disabled={!inputValue.trim() || isLoading}>
                        <span className="material-symbols-outlined">send</span>
                    </button>
                </form>
                <div className="input-hint">Press Enter to send, Shift+Enter for new line</div>
            </div>

            <style>{`
                .chat-ai-sidebar {
                    width: 500px;
                    height: 100%;
                    background: #0d1117;
                    border-left: 1px solid #21262d;
                    display: flex;
                    flex-direction: column;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    z-index: 100;
                    box-shadow: -10px 0 30px rgba(0, 0, 0, 0.3);
                }

                .chat-ai-sidebar.closed {
                    width: 0;
                    opacity: 0;
                    pointer-events: none;
                }

                .chat-header {
                    padding: 1.25rem 1.5rem;
                    background: linear-gradient(to right, #161b22, #0d1117);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .header-info {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .ai-icon {
                    color: #58a6ff;
                    font-size: 1.5rem;
                    filter: drop-shadow(0 0 8px rgba(88, 166, 255, 0.3));
                }

                .chat-header h3 {
                    margin: 0;
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: #ffffff;
                    letter-spacing: 0.01em;
                }

                .status-pill {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(35, 134, 54, 0.1);
                    padding: 2px 8px;
                    border-radius: 12px;
                    width: fit-content;
                    margin-top: 2px;
                }

                .status-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #238636;
                    box-shadow: 0 0 10px rgba(35, 134, 54, 0.5);
                    animation: pulse 2s infinite;
                }

                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.2); opacity: 0.7; }
                    100% { transform: scale(1); opacity: 1; }
                }

                .status-text {
                    font-size: 9px;
                    color: #3fb950;
                    font-weight: 600;
                    text-transform: uppercase;
                }

                .sidebar-action-btn {
                    background: transparent;
                    border: none;
                    color: #8b949e;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .sidebar-action-btn:hover {
                    background: #30363d;
                    color: #f0f6fc;
                }

                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1.25rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                    background: #0d1117;
                    scrollbar-gutter: stable;
                }

                .chat-messages::-webkit-scrollbar {
                    width: 5px;
                }

                .chat-messages::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }

                .message-bubble {
                    display: flex;
                    gap: 12px;
                    max-width: 95%;
                    animation: messageFadeIn 0.3s ease-out;
                }

                @keyframes messageFadeIn {
                    from { transform: translateY(10px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }

                .message-bubble.user {
                    align-self: flex-end;
                    flex-direction: row-reverse;
                }

                .message-bubble.assistant {
                    align-self: flex-start;
                    max-width: 100%;
                }

                .avatar-mini {
                    width: 32px;
                    height: 32px;
                    background: #21262d;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }

                .avatar-mini span {
                    font-size: 18px;
                    color: #58a6ff;
                }

                .message-content {
                    flex: 1;
                    min-width: 0;
                }

                .user .message-content {
                    background: #1f6feb;
                    color: #ffffff;
                    padding: 0.75rem 1rem;
                    border-radius: 12px;
                    border-top-right-radius: 2px;
                    box-shadow: 0 4px 12px rgba(31, 111, 235, 0.2);
                    font-size: 0.95rem;
                }

                .assistant .message-content {
                    color: #e6edf3;
                    font-size: 0.95rem;
                    line-height: 1.6;
                }

                .assistant .message-content p {
                    margin: 0 0 1rem 0;
                }

                /* Code Block Enhancements */
                .code-block {
                    background: #0d1117;
                    border-radius: 10px;
                    margin: 1rem 0;
                    position: relative;
                    overflow: hidden;
                    border: 1px solid #30363d;
                    width: 100%;
                    box-sizing: border-box;
                }

                .code-header {
                    background: #161b22;
                    padding: 8px 12px;
                    font-size: 0.75rem;
                    color: #8b949e;
                    font-weight: 600;
                    border-bottom: 1px solid #30363d;
                    display: flex;
                    justify-content: space-between;
                    letter-spacing: 0.5px;
                }

                .code-block code {
                    display: block;
                    padding: 1.25rem;
                    overflow-x: auto;
                    white-space: pre;
                    color: #d1d5db;
                    font-family: 'Fira Code', 'JetBrains Mono', monospace;
                    font-size: 0.85rem;
                    line-height: 1.5;
                }

                .copy-btn {
                    position: absolute;
                    top: 36px;
                    right: 12px;
                    background: rgba(48, 54, 61, 0.8);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #c9d1d9;
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transition: all 0.2s;
                }

                .code-block:hover .copy-btn {
                    opacity: 1;
                }

                .copy-btn:hover {
                    background: #58a6ff;
                    color: white;
                    border-color: #58a6ff;
                }

                .chat-input-wrapper {
                    padding: 1.25rem;
                    background: #161b22;
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                }

                .chat-input-area {
                    display: flex;
                    gap: 0.75rem;
                    align-items: flex-end;
                    background: #0d1117;
                    border: 1px solid #30363d;
                    border-radius: 12px;
                    padding: 8px;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }

                .chat-input-area:focus-within {
                    border-color: #58a6ff;
                    box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.1);
                }

                .chat-input-area textarea {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: #ffffff;
                    font-family: inherit;
                    font-size: 0.95rem;
                    resize: none;
                    min-height: 24px;
                    max-height: 150px;
                    outline: none;
                    padding: 6px 4px;
                    line-height: 1.5;
                }

                .send-btn {
                    background: #238636;
                    color: white;
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    flex-shrink: 0;
                }

                .send-btn:hover:not(:disabled) {
                    background: #2ea043;
                    transform: scale(1.05);
                }

                .send-btn:disabled {
                    background: #21262d;
                    color: #484f58;
                    cursor: not-allowed;
                }

                .input-hint {
                    font-size: 10px;
                    color: #8b949e;
                    margin-top: 8px;
                    text-align: center;
                }
            `}</style>
        </div>
    );
};

export default ChatWithAI;
