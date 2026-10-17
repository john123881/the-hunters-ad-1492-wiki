import { useState, type FormEvent, type Ref } from 'react';
import { Play } from 'lucide-react';
import { useAudioPlayerControls, useAudioPlayerState } from './useAudioPlayer';

interface AudioCodeInputProps {
  inputRef?: Ref<HTMLInputElement>;
}

export function AudioCodeInput({ inputRef }: AudioCodeInputProps) {
  const [value, setValue] = useState('');
  const { playByCode } = useAudioPlayerControls();
  const { status } = useAudioPlayerState();
  const busy = status === 'resolving' || status === 'loading';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void playByCode(value);
  };

  return <form className="audio-code-form" onSubmit={submit}>
    <label htmlFor="global-audio-code">語音代碼</label>
    <div>
      <input
        ref={inputRef}
        id="global-audio-code"
        value={value}
        onChange={event => setValue(event.target.value)}
        placeholder="例如 Q1、VW2、37.22"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" disabled={!value.trim() || busy}>
        <Play aria-hidden="true" />
        {busy ? '載入中' : '播放'}
      </button>
    </div>
    <p>任務 Q／V／L · 瓦瑟堡 W／VW／LW · 劇情直接輸入章節</p>
  </form>;
}
