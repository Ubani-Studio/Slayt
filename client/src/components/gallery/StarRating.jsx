import { useState } from 'react';

function StarRating({ rating = 0, onChange, size = 'sm', readOnly = false }) {
  const [hoverIndex, setHoverIndex] = useState(-1);

  const dim = size === 'md' ? 8 : 6;
  const gap = 2;

  const handleClick = (index) => {
    if (readOnly || !onChange) return;
    const newRating = index + 1;
    onChange(newRating === rating ? 0 : newRating);
  };

  return (
    <div
      className="flex items-center"
      style={{ gap: `${gap}px` }}
      onMouseLeave={() => !readOnly && setHoverIndex(-1)}
    >
      {[0, 1, 2, 3, 4].map((index) => {
        const filled = hoverIndex >= 0 ? index <= hoverIndex : index < rating;
        const hovering = hoverIndex >= 0 && index <= hoverIndex;

        return (
          <button
            key={index}
            type="button"
            disabled={readOnly}
            onClick={() => handleClick(index)}
            onMouseEnter={() => !readOnly && setHoverIndex(index)}
            className="p-0 border-0 outline-none disabled:cursor-default"
            style={{ cursor: readOnly ? 'default' : 'pointer' }}
          >
            <div
              style={{
                width: `${dim}px`,
                height: `${dim}px`,
              }}
              className={
                filled
                  ? hovering
                    ? 'bg-dark-400'
                    : 'bg-dark-200'
                  : hovering
                    ? 'bg-dark-400'
                    : 'bg-dark-700'
              }
            />
          </button>
        );
      })}
    </div>
  );
}

export default StarRating;
