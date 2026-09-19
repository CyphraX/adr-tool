import { describe, expect, it } from 'vitest'
import { titleOf } from '../src/text/title'

describe('titleOf', () => {
  it('is the first level-one heading', () => {
    expect(titleOf('\n# Postgres for the write model\n\nText\n\n# Second\n')).toBe(
      'Postgres for the write model'
    )
  })

  it('reads CRLF bodies and drops a closing sequence of hashes', () => {
    expect(titleOf('# Title ##\r\n\r\nText\r\n')).toBe('Title')
  })

  it('skips deeper headings, hashtags and empty headings', () => {
    expect(titleOf('## Context\n#hashtag\n#\n# Real title\n')).toBe('Real title')
  })

  it('does not look inside fenced code blocks', () => {
    const body =
      '```sh\n# a shell comment\n```\n\n~~~~\n# still code\n~~~\n# also code\n~~~~\n# Title\n'
    expect(titleOf(body)).toBe('Title')
  })

  it('is undefined when there is no such heading', () => {
    expect(titleOf('Just a paragraph.\n\n## Only a section\n')).toBeUndefined()
  })
})
