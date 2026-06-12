"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  label?: string;
};

type State = {
  hasError: boolean;
};

/**
 * Catches render errors inside a single report section so one broken section
 * degrades to a small notice instead of taking down the entire page with
 * "Application error: a client-side exception has occurred".
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`Section "${this.props.label ?? "unknown"}" crashed:`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: "#fff",
            border: "1px solid #fde68a",
            borderRadius: 16,
            padding: "20px 24px",
            color: "#92400e",
            fontSize: 14,
            fontWeight: 600
          }}
        >
          Deze sectie kon niet worden geladen. De rest van het rapport werkt gewoon.
        </div>
      );
    }
    return this.props.children;
  }
}
