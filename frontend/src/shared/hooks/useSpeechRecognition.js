import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

export const useSpeechRecognition = ({ onResult, onStart, onEnd }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = navigator.language || 'en-US';

    recognitionRef.current = recognition;

    return () => {
      // Cleanup on unmount
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore abort errors on unmount
        }
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onstart = null;
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      toast.error("Voice search is not supported in your browser.");
      return;
    }

    if (isListening || !recognitionRef.current) return;

    try {
      const recognition = recognitionRef.current;

      recognition.onstart = () => {
        setIsListening(true);
        if (onStart) onStart();
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        let isFinal = false;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
            isFinal = true;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentTranscript = finalTranscript || interimTranscript;
        if (onResult) onResult(currentTranscript, isFinal);
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          toast.error("Microphone access denied. Please allow microphone permissions.");
        } else if (event.error === 'network') {
          toast.error("Network error occurred during speech recognition.");
        } else if (event.error === 'no-speech') {
          toast.error("No speech detected. Please try again.");
        } else {
          toast.error("An error occurred during voice search.");
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        if (onEnd) onEnd();
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
      toast.error("Could not start voice search.");
    }
  }, [isListening, isSupported, onResult, onStart, onEnd]);

  const stopListening = useCallback(() => {
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore stop errors
      }
      setIsListening(false);
      if (onEnd) onEnd();
    }
  }, [isListening, onEnd]);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening
  };
};

export default useSpeechRecognition;
