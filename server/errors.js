/** An error whose message is safe to show to the person using the site. */
export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const bad = (message, status) => { throw new UserError(message, status); };
