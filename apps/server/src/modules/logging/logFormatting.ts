export const formatLogMessage = (message: any, stack: any) => {
  if (Array.isArray(stack) && stack.length > 0 && stack[0] != null) {
    let stackMessage = '';

    if (stack[0] instanceof Error) {
      stackMessage = stack[0].stack;
    } else if (typeof stack[0] === 'string') {
      stackMessage = stack[0];
    }

    if (typeof message === 'string' && stackMessage.includes(message)) {
      // Remove duplicate messaging
      message = stackMessage;
    } else {
      message = `${message}\n${stackMessage}`;
    }
  }

  return message;
};
