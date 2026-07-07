import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Odmontowuje wyrenderowane drzewo po każdym teście — inaczej kolejne render() nakładają się
// w tym samym document i zapytania trafiają na "multiple elements".
afterEach(() => {
  cleanup();
});
