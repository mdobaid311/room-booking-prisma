"use client";

import { useMemo, useRef, useState } from "react";
import { ResourceScheduler, ViewType } from "resource-scheduler";
import type { Placement, ResourceInput, SchedulerEvent, VisibleRange } from "resource-scheduler";
import "resource-scheduler/style.css";

import { ApiRequestError, api } from "@/lib/api-client";
import type { BookingDTO, RoomDTO } from "@/lib/api-types";
import { CLOSE_HOUR, OFFICE_TIME_ZONE, OPEN_HOUR, SLOT_MINUTES, formatOfficeTime } from "@/lib/office";
import { bookingRules } from "@/lib/rules";

import { BookingDialog, rememberBooker } from "./booking-dialog";
import type { BookingDetails, BookingDraft } from "./booking-dialog";

type Booking = {
  id: string;
  title: string;
  booker: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
  /** Shown but not saved yet: drawn grey, and cannot be moved until the server answers. */
  pending: boolean;
};

type Notice = { kind: "success" | "error"; text: string };

const PENDING_COLOR = "#94a3b8";
const rules = bookingRules();

const fromDTO = (b: BookingDTO): Booking => ({
  ...b,
  startsAt: new Date(b.startsAt),
  endsAt: new Date(b.endsAt),
  pending: false,
});

const messageOf = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : "Something went wrong. Try again.";

const isGone = (error: unknown) => error instanceof ApiRequestError && error.code === "not_found";
const isConflict = (error: unknown) => error instanceof ApiRequestError && error.code === "conflict";

/**
 * The calendar. Every change is optimistic: it shows at once, is sent to the
 * API, and is rolled back with the server's message if the server refuses.
 */
export function Board({
  rooms,
  initialBookings,
  initialDate,
}: {
  rooms: RoomDTO[];
  initialBookings: BookingDTO[];
  initialDate: string;
}) {
  const [bookings, setBookings] = useState(() => initialBookings.map(fromDTO));
  const [start] = useState(() => new Date(initialDate));
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const visibleRange = useRef<VisibleRange | null>(null);
  const loadController = useRef<AbortController | null>(null);

  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? "the room";

  const resources = useMemo<ResourceInput[]>(
    () => rooms.map((r) => ({ id: r.id, name: r.name, role: `${r.seats} seats`, group: r.floor })),
    [rooms],
  );

  const events = useMemo<SchedulerEvent[]>(
    () =>
      bookings.map((b) => ({
        id: b.id,
        title: b.title,
        description: `Booked by ${b.booker}`,
        resourceId: b.roomId,
        startDate: b.startsAt,
        endDate: b.endsAt,
        ...(b.pending && { color: PENDING_COLOR }),
      })),
    [bookings],
  );

  // The shared rules, plus one that only matters in the browser: a booking
  // that is still being saved cannot be moved yet.
  const isValidDrop = (event: SchedulerEvent, placement: Placement) =>
    !bookings.some((b) => b.id === event.id && b.pending) && rules.isValidDrop(event, placement);

  async function book(slot: BookingDraft, details: BookingDetails) {
    const tempId = `pending-${crypto.randomUUID()}`;
    setDraft(null);
    setNotice(null);
    rememberBooker(details.booker);
    setBookings((all) => [
      ...all,
      { id: tempId, ...details, roomId: slot.resourceId, startsAt: slot.start, endsAt: slot.end, pending: true },
    ]);

    try {
      const saved = await api.create({ roomId: slot.resourceId, startsAt: slot.start, endsAt: slot.end, ...details });
      setBookings((all) => all.map((b) => (b.id === tempId ? fromDTO(saved) : b)));
      setNotice({
        kind: "success",
        text: `Booked ${slot.roomName}, ${formatOfficeTime(slot.start)} to ${formatOfficeTime(slot.end)}.`,
      });
    } catch (error) {
      setBookings((all) => all.filter((b) => b.id !== tempId)); // roll back
      setNotice({ kind: "error", text: messageOf(error) });
      if (isConflict(error)) void refresh(); // show what is in the way
      if (error instanceof ApiRequestError && error.code === "invalid") {
        setDraft({ ...slot, values: details, errors: error.fields }); // reopen the form with the server's messages
      }
    }
  }

  /** Moving and resizing both end with a room and a new start and end. */
  async function reschedule(id: string, roomId: string, startsAt: Date, endsAt: Date) {
    const before = bookings.find((b) => b.id === id);
    if (!before || before.pending) return;
    setNotice(null);
    setBookings((all) => all.map((b) => (b.id === id ? { ...b, roomId, startsAt, endsAt, pending: true } : b)));

    try {
      const saved = await api.move(id, { roomId, startsAt, endsAt });
      setBookings((all) => all.map((b) => (b.id === id ? fromDTO(saved) : b)));
    } catch (error) {
      setBookings((all) =>
        isGone(error) ? all.filter((b) => b.id !== id) : all.map((b) => (b.id === id ? before : b)), // roll back
      );
      setNotice({ kind: "error", text: messageOf(error) });
      if (isConflict(error)) void refresh(); // show what is in the way
    }
  }

  async function cancel(id: string) {
    const before = bookings.find((b) => b.id === id);
    if (!before || before.pending) return;
    setNotice(null);
    setBookings((all) => all.filter((b) => b.id !== id));

    try {
      await api.cancel(id);
      setNotice({ kind: "success", text: `Cancelled "${before.title}".` });
    } catch (error) {
      if (isGone(error)) {
        setNotice({ kind: "success", text: `"${before.title}" was already cancelled.` });
        return;
      }
      setBookings((all) => [...all, before]); // roll back
      setNotice({ kind: "error", text: messageOf(error) });
    }
  }

  /** Replaces the saved bookings of `range` with the server's, keeping unsaved ones. */
  async function fetchRange({ start: from, end: to }: VisibleRange) {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);

    try {
      const fetched = (await api.list(from, to, controller.signal)).map(fromDTO);
      setBookings((all) => {
        const pending = all.filter((b) => b.pending);
        const outside = all.filter((b) => !b.pending && (b.endsAt <= from || b.startsAt >= to));
        return [...outside, ...pending, ...fetched.filter((f) => !pending.some((p) => p.id === f.id))];
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setNotice({ kind: "error", text: messageOf(error) });
    } finally {
      if (loadController.current === controller) setLoading(false);
    }
  }

  /** The grid moved to another day: load it. The first day came with the page. */
  function onRangeChange(range: VisibleRange) {
    const first = visibleRange.current === null;
    visibleRange.current = range;
    if (!first) void fetchRange(range);
  }

  /** Reloads the day on screen, after a conflict showed it is out of date. */
  async function refresh() {
    if (visibleRange.current) await fetchRange(visibleRange.current);
  }

  return (
    <>
      <div className="board-status">
        <p className="muted">
          Drag across free time to book. Drag a booking to move it, or its edge to resize it. Times are{" "}
          {OFFICE_TIME_ZONE} time.
        </p>
        {loading && <span className="muted">Loading…</span>}
      </div>

      <div className="notice-slot" aria-live="polite">
        {notice && (
          <div className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
            <span>{notice.text}</span>
            <button type="button" className="notice-close" aria-label="Dismiss" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}
      </div>

      <div className="board-frame">
        <ResourceScheduler
          resources={resources}
          events={events}
          timeZone={OFFICE_TIME_ZONE}
          initialDate={start}
          initialView={ViewType.Day}
          allowViewChange={false}
          slotDuration={SLOT_MINUTES}
          dayStartHour={OPEN_HOUR}
          dayEndHour={CLOSE_HOUR}
          nowIndicator
          ariaLabel="Meeting room bookings"
          labels={{ resources: "Rooms" }}
          eventOverlap={rules.eventOverlap}
          isValidDrop={isValidDrop}
          onSlotSelect={(slot) => setDraft({ ...slot, roomName: roomName(slot.resourceId) })}
          onEventDrop={(event, _fromRoom, toRoom, startsAt, endsAt) => reschedule(event.id, toRoom, startsAt, endsAt)}
          onEventResize={(event, roomId, startsAt, endsAt) => reschedule(event.id, roomId, startsAt, endsAt)}
          onRangeChange={onRangeChange}
          renderEventPopover={(event, resource, close) => {
            const booking = bookings.find((b) => b.id === event.id);
            return (
              <div className="details">
                <p className="details-title">{event.title}</p>
                {booking && (
                  <p className="muted">
                    {resource.name}, {formatOfficeTime(booking.startsAt)} to {formatOfficeTime(booking.endsAt)}
                    <br />
                    Booked by {booking.booker}
                  </p>
                )}
                {booking?.pending ? (
                  <p className="muted">Saving…</p>
                ) : (
                  <button
                    type="button"
                    className="button danger"
                    onClick={() => {
                      close();
                      cancel(event.id);
                    }}
                  >
                    Cancel booking
                  </button>
                )}
              </div>
            );
          }}
        />
      </div>

      {draft && (
        <BookingDialog
          key={`${draft.resourceId}:${draft.start.getTime()}:${draft.errors ? "retry" : "new"}`}
          draft={draft}
          onBook={(details) => book(draft, details)}
          onCancel={() => setDraft(null)}
        />
      )}
    </>
  );
}
