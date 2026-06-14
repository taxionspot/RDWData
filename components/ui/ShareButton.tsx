"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Share2, MessageCircle, Mail, Link2, Check } from "lucide-react";
import { formatDisplayPlate } from "@/lib/rdw/normalize";
import { track } from "@/lib/analytics";
import styles from "./ShareButton.module.css";

type Props = {
  plate: string;
  vehicleName?: string;
  locale: "nl" | "en";
  /** Class applied to the visible trigger so it can match the surrounding buttons. */
  triggerClassName?: string;
};

/**
 * Share the canonical report link. On devices with the native Web Share sheet
 * (mostly mobile) it opens that; everywhere else it shows an explicit menu with
 * WhatsApp, e-mail and copy-link, so the link is always shareable. Builds a
 * clean URL (origin + /search/<plate>) instead of window.location.href so query
 * params like ?mileage are not leaked into shared links.
 */
export function ShareButton({ plate, vehicleName, locale, triggerClassName }: Props) {
  const nl = locale === "nl";
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuId = `share-menu-${plate}`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reset the "copied" confirmation after a moment, cancelling the timer if the
  // component unmounts first (no setState-after-unmount).
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  const display = formatDisplayPlate(plate) || plate;
  const name = (vehicleName ?? "").trim();

  const share = useMemo(() => {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://kentekenrapport.com";
    const url = `${origin}/search/${encodeURIComponent(plate)}`;
    const title = nl ? `Kentekenrapport ${display}` : `Vehicle report ${display}`;
    const text = nl
      ? `Bekijk het kentekenrapport${name ? ` van de ${name}` : ""} (${display}):`
      : `Check the vehicle report${name ? ` for the ${name}` : ""} (${display}):`;
    const shareLine = `${text} ${url}`;
    return {
      url,
      title,
      text,
      waHref: `https://wa.me/?text=${encodeURIComponent(shareLine)}`,
      mailHref: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareLine)}`
    };
  }, [plate, display, name, nl]);

  const onTrigger = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: share.title, text: share.text, url: share.url });
        track("report_share", { plate, method: "native" });
        return;
      } catch (error) {
        // AbortError = the user dismissed the native sheet on purpose: stop here.
        if (error instanceof Error && error.name === "AbortError") return;
        // Any other failure (unsupported payload, permission): fall back to the menu.
      }
    }
    setOpen((value) => !value);
  };

  const copyLink = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(share.url);
      } else {
        // Fallback for older browsers / non-secure contexts where the async
        // Clipboard API is unavailable.
        const textarea = document.createElement("textarea");
        textarea.value = share.url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      track("report_share", { plate, method: "copy" });
    } catch {
      // Clipboard blocked: leave the menu open so the user can use the
      // WhatsApp/e-mail options instead.
    }
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => void onTrigger()}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
      >
        <Share2 size={16} />
        {nl ? "Delen" : "Share"}
      </button>

      {open ? (
        <div className={styles.menu} role="menu" id={menuId}>
          <a
            className={styles.item}
            href={share.waHref}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => {
              track("report_share", { plate, method: "whatsapp" });
              setOpen(false);
            }}
          >
            <MessageCircle size={16} className={styles.waIcon} />
            WhatsApp
          </a>
          <a
            className={styles.item}
            href={share.mailHref}
            role="menuitem"
            onClick={() => {
              track("report_share", { plate, method: "email" });
              setOpen(false);
            }}
          >
            <Mail size={16} className={styles.mailIcon} />
            {nl ? "E-mail" : "Email"}
          </a>
          <button type="button" className={styles.item} role="menuitem" onClick={() => void copyLink()}>
            {copied ? <Check size={16} className={styles.okIcon} /> : <Link2 size={16} className={styles.linkIcon} />}
            {copied ? (nl ? "Gekopieerd!" : "Copied!") : nl ? "Kopieer link" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
