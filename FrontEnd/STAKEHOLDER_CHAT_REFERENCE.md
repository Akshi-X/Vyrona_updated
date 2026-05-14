# Stakeholder Chat Features Reference

This document clarifies the two different stakeholder chat features in the application.

## 1. Dashboard Stakeholder Chats Modal
**Location:** Dashboard page (`/dashboard`)  
**Component:** `StakeholderChatsModal`  
**State Variable:** `showStakeholderChats`  
**Purpose:** Shows a list of unread messages from stakeholders in a modal format  
**File:** `FrontEnd/src/components/StakeholderChatsModal/index.tsx`  
**Usage:** Click the Stakeholder Chats icon in the Dashboard header

**How to refer to it in prompts:**
- "Dashboard Stakeholder Chats Modal"
- "Dashboard Stakeholder Chats"
- "Stakeholder Chats Modal in Dashboard"

## 2. Track & Trace Group Chat Screen
**Location:** Track & Trace page (`/track/:patientId`)  
**Component:** Full-screen overlay (inline in Track page)  
**State Variable:** `showStakeholderChatScreen`  
**Purpose:** Full-screen group chat interface (WhatsApp/Teams style) for chatting with stakeholders  
**File:** `FrontEnd/src/pages/Track/index.tsx` (lines 481-598)  
**Usage:** Click the Stakeholder Chats icon in the Track & Trace page header

**How to refer to it in prompts:**
- "Track & Trace Stakeholder Chat Screen"
- "Track & Trace Group Chat"
- "Group Chat Window in Track page"
- "Stakeholder Chat Screen"

## Quick Reference Table

| Feature | Location | Component Name | State Variable | Style |
|---------|----------|----------------|---------------|-------|
| Dashboard Modal | Dashboard | `StakeholderChatsModal` | `showStakeholderChats` | Modal with list view |
| Track Chat Screen | Track & Trace | Inline overlay | `showStakeholderChatScreen` | Full-screen group chat |

## Tips for Giving Prompts

✅ **Good examples:**
- "Change the background color in the Track & Trace Group Chat Screen"
- "Make the Dashboard Stakeholder Chats modal wider"
- "Add emoji picker to the Stakeholder Chat Screen"

❌ **Avoid:**
- "Change the stakeholder chat" (too vague - which one?)
- "Fix the chat modal" (which page?)

