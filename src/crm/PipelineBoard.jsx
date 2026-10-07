import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../admin/components";
import { Avatar } from "../admin/forms";
import { brl } from "../office/model";
import { stages, stageLabel } from "./model";

const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
const ghostTransform = (session) => {
  const left = Math.max(
    12,
    Math.min(innerWidth - session.width - 12, session.x - session.offsetX),
  );
  return `translate3d(${left}px, ${session.y - session.offsetY}px, 0) rotate(${session.reduced ? 0 : 1.5}deg)`;
};

export default function PipelineBoard({
  clients,
  people,
  stage,
  pendingId,
  onMove,
  onOpen,
}) {
  const board = useRef(null),
    positions = useRef(new Map()),
    animations = useRef(new Map());
  const pointer = useRef(null),
    frame = useRef(0),
    ghost = useRef(null);
  const [dragging, setDragging] = useState(null),
    [over, setOver] = useState("");
  const [floating, setFloating] = useState(null);

  // Keep coordinates relative to the board, including its horizontal scroll.
  const relativeRect = (rect) => {
    const bounds = board.current.getBoundingClientRect();
    return {
      left: rect.left - bounds.left + board.current.scrollLeft,
      top: rect.top - bounds.top,
    };
  };
  useLayoutEffect(() => {
    const next = new Map();
    board.current.querySelectorAll("[data-client-id]").forEach((element) => {
      const id = element.dataset.clientId,
        visual = relativeRect(element.getBoundingClientRect());
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      const rect = {
        left: visual.left - matrix.m41,
        top: visual.top - matrix.m42,
      };
      const previous = positions.current.get(id),
        active = animations.current.get(id);
      next.set(id, rect);
      if (reducedMotion()) {
        active?.animation.cancel();
        animations.current.delete(id);
        return;
      }
      if (!previous) return;
      const x = previous.left - rect.left,
        y = previous.top - rect.top;
      // A fast server acknowledgement must not interrupt the flight already in progress.
      if (Math.abs(x) + Math.abs(y) < 1) return;
      let from = previous;
      if (active?.animation.playState === "running") {
        const progress =
          active.animation.effect.getComputedTiming().progress ?? 1;
        from = {
          left:
            active.from.left + (active.to.left - active.from.left) * progress,
          top: active.from.top + (active.to.top - active.from.top) * progress,
        };
      }
      active?.animation.cancel();
      const animation = element.animate(
        [
          {
            transform: `translate(${from.left - rect.left}px, ${from.top - rect.top}px)`,
            zIndex: 3,
          },
          { transform: "translate(0, 0)", zIndex: 3 },
        ],
        { duration: 380, easing: "cubic-bezier(.22,1,.36,1)" },
      );
      animations.current.set(id, { animation, from, to: rect });
    });
    animations.current.forEach((active, id) => {
      if (!next.has(id)) {
        active.animation.cancel();
        animations.current.delete(id);
      }
    });
    positions.current = next;
  }, [clients]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      animations.current.forEach(({ animation }) => animation.cancel());
    },
    [],
  );

  const clearDrag = () => {
    cancelAnimationFrame(frame.current);
    pointer.current = null;
    setDragging(null);
    setOver("");
    setFloating(null);
  };
  useEffect(() => {
    const cancel = (event) => {
      if (!event || event.key === "Escape") clearDrag();
    };
    const visibility = () => {
      if (document.hidden) clearDrag();
    };
    window.addEventListener("keydown", cancel);
    window.addEventListener("blur", clearDrag);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", cancel);
      window.removeEventListener("blur", clearDrag);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  const commit = (id, destination) => {
    const client = clients.find((item) => item.id === id);
    if (!pendingId && client && destination && client.stage !== destination)
      onMove(id, destination);
    clearDrag();
  };
  const findColumn = (x, y) => {
    const column = document.elementFromPoint(x, y)?.closest("[data-stage]");
    return column && board.current.contains(column) ? column.dataset.stage : "";
  };
  const paintPointer = () => {
    const session = pointer.current;
    if (!session?.active) return;
    if (ghost.current) ghost.current.style.transform = ghostTransform(session);
    const bounds = board.current.getBoundingClientRect();
    if (session.y >= bounds.top && session.y <= bounds.bottom) {
      const edge = 48;
      if (session.x > bounds.right - edge)
        board.current.scrollLeft += Math.min(
          14,
          (session.x - bounds.right + edge) / 3,
        );
      else if (session.x < bounds.left + edge)
        board.current.scrollLeft -= Math.min(
          14,
          (bounds.left + edge - session.x) / 3,
        );
    }
    setOver(findColumn(session.x, session.y));
    frame.current = requestAnimationFrame(paintPointer);
  };
  const pointerDown = (event, client) => {
    if (pendingId || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget
      .closest("[data-client-id]")
      .getBoundingClientRect();
    pointer.current = {
      id: client.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      reduced: reducedMotion(),
      active: false,
    };
  };
  const pointerMove = (event) => {
    const session = pointer.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.x = event.clientX;
    session.y = event.clientY;
    if (
      !session.active &&
      Math.hypot(session.x - session.startX, session.y - session.startY) > 6
    ) {
      session.active = true;
      setDragging(session.id);
      setFloating({ ...session });
      frame.current = requestAnimationFrame(paintPointer);
    }
  };
  const pointerUp = (event) => {
    const session = pointer.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const destination = findColumn(event.clientX, event.clientY);
    if (
      session.active &&
      ghost.current &&
      destination &&
      destination !== clients.find((client) => client.id === session.id)?.stage
    ) {
      animations.current.get(session.id)?.animation.cancel();
      animations.current.delete(session.id);
      positions.current.set(
        session.id,
        relativeRect(ghost.current.getBoundingClientRect()),
      );
    }
    if (session.active) commit(session.id, destination);
    else clearDrag();
  };
  const activeClient = clients.find((client) => client.id === dragging);
  return (
    <>
      <p className="crm-kanban-hint" id="pipeline-help">
        <Icon name="grip" size={14} />
        Arraste pela alça ou escolha a etapa no cartão.
      </p>
      <div
        ref={board}
        className={`crm-kanban${dragging ? " is-dragging" : ""}`}
        aria-label="Pipeline de oportunidades"
        aria-describedby="pipeline-help"
      >
        {stages
          .filter(([key]) => !stage || key === stage)
          .map(([key, label]) => {
            const highlighted = over === key && activeClient?.stage !== key;
            return (
              <section
                className={`crm-kanban-column${highlighted ? " is-drop-target" : ""}`}
                data-stage={key}
                key={key}
                onDragOver={(event) => {
                  if (!dragging || pendingId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(key);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setOver((current) => (current === key ? "" : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  commit(event.dataTransfer.getData("text/duuk-client"), key);
                }}
              >
                <header>
                  <h2>{label}</h2>
                  <span>
                    {clients.filter((client) => client.stage === key).length}
                  </span>
                </header>
                <div>
                  <div
                    className={`crm-drop-slot${highlighted ? " is-visible" : ""}`}
                    aria-hidden="true"
                  >
                    <Icon name="plus" size={16} />
                    Soltar em {label.toLowerCase()}
                  </div>
                  {clients
                    .filter((client) => client.stage === key)
                    .map((client) => {
                      const owner = people.find(
                          (person) => person.id === client.owner_id,
                        ),
                        pending = pendingId === client.id;
                      return (
                        <article
                          key={client.id}
                          data-client-id={client.id}
                          className={`crm-kanban-card${dragging === client.id ? " is-drag-source" : ""}${pending ? " is-saving" : ""}`}
                          aria-busy={pending}
                          draggable={!pendingId}
                          onDragStart={(event) => {
                            if (
                              event.target.closest("select, .crm-drag-handle")
                            ) {
                              event.preventDefault();
                              return;
                            }
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "text/duuk-client",
                              client.id,
                            );
                            setDragging(client.id);
                          }}
                          onDragEnd={clearDrag}
                        >
                          <div className="crm-kanban-card__head">
                            <button
                              className="crm-client-button"
                              onClick={() => onOpen(client)}
                            >
                              <h3>{client.name}</h3>
                              <p>{client.company || "Oportunidade"}</p>
                            </button>
                            <button
                              type="button"
                              className="crm-drag-handle admin-icon-button"
                              aria-label={`Arrastar ${client.name}`}
                              aria-describedby="pipeline-help"
                              disabled={!!pendingId}
                              title="Arrastar para outra etapa"
                              draggable={false}
                              onPointerDown={(event) =>
                                pointerDown(event, client)
                              }
                              onPointerMove={pointerMove}
                              onPointerUp={pointerUp}
                              onPointerCancel={clearDrag}
                              onLostPointerCapture={clearDrag}
                            >
                              <Icon name="grip" size={18} />
                            </button>
                          </div>
                          <strong>{brl(client.estimated_cents)}</strong>
                          <small className="crm-person">
                            <Avatar profile={owner} size={22} />
                            {owner?.name || "Sem responsável"}
                          </small>
                          <select
                            aria-label={`Etapa de ${client.name}`}
                            value={client.stage}
                            disabled={!!pendingId}
                            onChange={(event) =>
                              commit(client.id, event.target.value)
                            }
                          >
                            {stages.map(([value, text]) => (
                              <option key={value} value={value}>
                                {text}
                              </option>
                            ))}
                          </select>
                          {pending && (
                            <span className="crm-kanban-saving" role="status">
                              <Icon
                                name="refresh"
                                size={12}
                                className="is-spinning"
                              />
                              Salvando etapa…
                            </span>
                          )}
                        </article>
                      );
                    })}
                </div>
              </section>
            );
          })}
      </div>
      {floating &&
        activeClient &&
        createPortal(
          <div
            ref={ghost}
            className="crm-kanban-ghost"
            aria-hidden="true"
            style={{
              width: floating.width,
              transform: ghostTransform(floating),
            }}
          >
            <strong>{activeClient.name}</strong>
            <span>{activeClient.company || "Oportunidade"}</span>
            <b>{brl(activeClient.estimated_cents)}</b>
            <small>{over ? stageLabel(over) : "Escolha uma etapa"}</small>
          </div>,
          document.body,
        )}
    </>
  );
}
