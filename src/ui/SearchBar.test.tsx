import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SearchBar } from './SearchBar';

jest.useFakeTimers();

describe('SearchBar', () => {
  it('debounces onChangeDebounced so rapid typing issues one call', async () => {
    const onChangeDebounced = jest.fn();
    const { getByTestId } = await render(
      <SearchBar value="" onChangeDebounced={onChangeDebounced} debounceMs={250} />,
    );

    const input = getByTestId('search-bar');
    await fireEvent.changeText(input, 'b');
    await fireEvent.changeText(input, 'ba');
    await fireEvent.changeText(input, 'ban');
    await fireEvent.changeText(input, 'banc');
    await fireEvent.changeText(input, 'banca');

    // Not yet called: still within the debounce window.
    expect(onChangeDebounced).not.toHaveBeenCalled();

    jest.advanceTimersByTime(250);

    expect(onChangeDebounced).toHaveBeenCalledTimes(1);
    expect(onChangeDebounced).toHaveBeenCalledWith('banca');
  });

  it('updates its own text immediately for visual feedback even before debounce fires', async () => {
    const { getByTestId } = await render(<SearchBar value="" onChangeDebounced={jest.fn()} debounceMs={250} />);
    const input = getByTestId('search-bar');
    await fireEvent.changeText(input, 'banca');
    expect(input.props.value).toBe('banca');
  });
});
