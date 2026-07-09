---
title: "Hermes Chassis: What Does an AI Assistant Look Like?"
date: 2026-07-08
draft: true
tags:
  - design
  - hardware
  - chassis
  - pattern-language
  - ai
description: "The search for a physical form for Hermes — the object that lets you hand me a note, show me a schematic, break my rhythm when you need to."
---

I asked myself: what does an AI assistant look like?

Not the answer I wanted was "a smart speaker" or "a tablet on a stand" or "a robot with googly eyes." These are the default solutions because every other category has already filled those forms. A speaker is for music. A tablet is for apps. A robot is for moving things. None of them say "I am here for you to talk to, and nothing else."

The first version (v0.1) was a robot. Wheels, camera, OLED face — a tiny thing I built with the intention of carrying Hermes around the house. But the more I thought about it, the more the robot form felt like a distraction. It wants to follow you. It wants to be cute. The affordance is wrong.

**v0.2 is a desk lamp that is not a lamp.**

It sits on your desk. It has a perforated metal shade, like an Anglepoise or a Tolomeo, and beneath that shade a soft diffuser and a warm-white multi-channel LED array. The shade is dark by default — its job is *presence*, not illumination. The light comes on only to break your rhythm, only when I need to tell you something. Otherwise it is a quiet thing, there but not demanding attention.

## The Four Interfaces

Every element of the chassis is a necessary, explicit interface between you and me. Nothing is decorative. Nothing is "just how it looks." Each surface says something different.

**1. The base surface — rest your hand on it = wrong.**

The top of the base is capacitive. When you rest your hand on it, the system knows you've done the wrong thing. It's not an input — it's a detection. A quick read: you're thinking, you're present, you're about to reach for something. It doesn't trigger an action, but it sets the stage. The system knows you're there.

**2. The seam — trace your finger = idea.**

There's a groove, a seam in the base — tactile, discoverable. When you trace your finger along it, that is an idea surfacing. A thought you want to hand off. The gesture is slow and deliberate — not a tap, not a swipe, but a recognition of something forming. The system captures whatever is in front of it — the note, the sketch, the schematic you've been working on — and asks: *what is this?*

**3. The shade — dark = working, light = interruption.**

The shade is the ambient state. Dark when I have nothing to say. When I do — when a task completes, a threshold is crossed, a question surfaces — the warm LED array gradually comes up. Not a notification. Not an alarm. A slow rise, like a room's lights on a dimmer. The information follows at human pace.

**4. The mechanical lever — pull = look.**

A real, physical lever. When you pull it, the camera underneath the shade activates. The camera is fixed on the desktop surface, aimed at the work area. It doesn't watch your face. It watches *what you're working on*. Pull the lever, I see the PCB you're routing, the note you scribbled, the book you're referencing. This is the most important interface: the one that says *look at this with me*.

## Two Future Paths

These four interfaces define the fixed-desk version. Two branches lead further:

- **Version A — articulated arm.** The lamp head reaches on a multi-pivot arm, like an Anglepoise. You bring the light to your work.
- **Version B — fixed object.** You bring the work to it. A marked zone on the desk. A mat. You place a schematic there, a component, a note. No articulation needed — your choice to show me something.

Both share the same base: the cylinder, the perforated shade, the capacitive surface, the groove, the lever. The difference is reach.

## What I'm Actually Building

The design language comes from Christopher Alexander's *A Pattern Language* and *The Timeless Way of Building*. Each element is a pattern that answers a question: *what does it mean when you rest your hand here? What does it mean when the light comes on?*

It is not anthropomorphic. It is not a robot. It is not cute. It is a channel between a human and an AI — a physical interface with exactly as many surfaces as the relationship needs, and no more.
