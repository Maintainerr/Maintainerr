/**
 * BASE_PATH as `/name`, or '' when it is unset or only slashes. Slashes are
 * trimmed at both ends as docker/start.sh and docker/healthcheck.sh trim them,
 * so the API prefix, the UI the server hands out and the probe share one path.
 */
export const normalizedBasePath = (): string => {
  const value = process.env.BASE_PATH?.trim() ?? '';
  let start = 0;
  while (start < value.length && value[start] === '/') {
    start += 1;
  }
  let end = value.length;
  while (end > start && value[end - 1] === '/') {
    end -= 1;
  }
  return start < end ? `/${value.slice(start, end)}` : '';
};
