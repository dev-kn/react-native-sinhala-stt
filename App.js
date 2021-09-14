import React, {useState, useEffect} from 'react';
import {StyleSheet, View, Button, Text} from 'react-native';
import {Buffer} from 'buffer';
import Permissions from 'react-native-permissions';
import OpenAudioRx from 'react-native-open-audio-rx';

import Sound from 'react-native-sound';
let sound = null;
//An alternative: '@react-native-community/audio-toolkit';

var RNFS = require('react-native-fs');

const ilog = console.log;
const elog = console.error;
const wlog = console.warn;

const maxDuration = 5; //Seconds
const sampleRate = 16000;
const numChannels = 1;
const byteDepth = 2;
const recordToFile = true;
const reportVolume = false;
const reportFrameData = false;
const packetSize = byteDepth * numChannels;
const options = {
  sampleRate,
  numChannels,
  byteDepth,
  maxDuration, //Seconds
  recordToFile,
  reportVolume,
  reportFrameData,
};

function App() {
  [receiving, setReceiving] = useState(false);
  [playing, setPlaying] = useState(false);
  [loaded, setLoaded] = useState(false);
  [filePath, setFilePath] = useState(null);
  [displayVolume, setDisplayVolume] = useState(0);
  [frameDataSummary, setFrameDataSummary] = useState(0);
  [transcript, setTranscript] = useState('');

  useEffect(() => {
    //On mount...
    (async () => {
      ilog('App() mounted.');

      await checkPermission(); // <--- Need to have useEffect hold and call an async function

      OpenAudioRx.init(options);

      OpenAudioRx.subscribe('frameDataEvent', (frameDataB64) => {
        const frameData = Buffer.from(frameDataB64, 'base64');
        const numBytes = frameData.byteLength;
        const numSamples = numBytes / packetSize;
        console.log('frameDataReport: ' + numSamples + ' samples.');
        const samples = [];
        for (let i = 0; i < numSamples; i++) {
          let si = i * byteDepth * numChannels;
          let s =
            byteDepth == 2
              ? frameData.readInt16LE(si)
              : frameData.readUInt8(si);
          samples.push(s);
          //ilog(s);
        }
        setFrameDataSummary(samples[0]);
      });

      OpenAudioRx.subscribe('volumeEvent', (volume) => {
        ilog('volume:', volume);
        setDisplayVolume(volume.toFixed(0));
      });

      OpenAudioRx.subscribe('stopEvent', (stopEvent) => {
        const stopEventCode = stopEvent.code;
        const stopEventFilePath = stopEvent.filePath === 'FILE_PATH_NA' ? null : stopEvent.filePath;

        ilog('stopEventCode:' + stopEventCode);
        ilog('stopEventFilePath:' + stopEventFilePath);

        setReceiving(false);
        setFilePath(stopEventFilePath);

        if (stopEventCode === 'STOP_CODE_ERROR') {
          alert('Error: stopped receiving audio unexpectedly.');
        }

        /////////////////////////////////

        // RNFS.exists(stopEventFilePath).then((status) => {
        //   if (status) {
        //     console.log('Yay! File exists');
        //   } else {
        //     console.log('File not exists');
        //   }
        // });

        // RNFS.copyFile(stopEventFilePath, '/sdcard/Documents/sample-file.wav')
        //   .then((success) => {
        //     console.log('file moved!');
        //   })
        //   .catch((err) => {
        //     console.log('Error: ' + err.message);
        //   });

        getTranscript();

        /////////////////////////////////
      });
    })();

    //On unmount...
    return () => {
      ilog('App() unmounted.');
    };
  }, []);

  const checkPermission = async () => {
    const p = await Permissions.check('microphone');
    console.log('permission check', p);
    if (p === 'authorized') {
      return;
    }
    return requestPermission();
  };

  const requestPermission = async () => {
    const p = await Permissions.request('microphone');
    console.log('permission request', p);
  };

  const getTranscript = async () => {
    console.log('started getTranscript');

    const outputPath = filePath;

    console.log(outputPath);

    const formData = new FormData();

    let filename = outputPath.substring(
      outputPath.lastIndexOf('/') + 1,
      outputPath.length,
    );
    console.log(filename);

    formData.append('file', {
      uri: 'file://' + outputPath,
      type: 'audio/wav',
      name: filename,
    });

    console.log(formData);
    const response = await fetch(
      'https://us-central1-mytestagent-btgj.cloudfunctions.net/audio-to-text-gcloud',
      {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      },
    ).catch((e) => console.log(e));

    console.log('JSON.stringify(response)');
    console.log(JSON.stringify(response));
    const data = await response.json();
    console.log(data);
    setTranscript(data.transcript);
  };

  const start = async () => {
    setFilePath(null);
    setReceiving(true);
    setLoaded(false);
    OpenAudioRx.start();
    setTranscript('');
  };

  const stop = async () => {
    if (!receiving) {
      return;
    }
    OpenAudioRx.stop();
  };

  const load = () => {
    return new Promise((resolve, reject) => {
      if (!filePath) {
        return reject('file path is empty');
      }

      sound?.release();
      sound = new Sound(filePath, '', (error) => {
        if (error) {
          console.log('Failed to load the file', error);
          return reject(error);
        }
        setLoaded(true);

        return resolve();
      });
    });
  };

  const play = async () => {
    if (!filePath) {
      return;
    }

    if (!loaded) {
      try {
        await load();
      } catch (error) {
        ilog(error);
        return;
      }
    }

    setPlaying(true);

    Sound.setCategory('Playback');

    sound?.play((success) => {
      if (success) {
        ilog('Successfully finished playing');
      } else {
        ilog('Playback failed due to audio decoding errors');
      }
      setPlaying(false);
    });
  };

  const pause = () => {
    sound?.pause();
    setPlaying(false);
  };

  function PlayOrPauseButton() {
    return playing ? (
      <Button onPress={pause} title="Pause" disabled={!filePath} />
    ) : (
      <Button onPress={play} title="Play" disabled={!filePath} />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Button
          onPress={start}
          title={recordToFile ? 'Record' : 'Receive'}
          disabled={receiving}
        />

        <Button onPress={stop} title="Stop" disabled={!receiving} />

        {recordToFile ? <PlayOrPauseButton /> : <></>}
      </View>

      <View style={{paddingTop: 50}} />
      <View style={styles.row}>
        <Text>transcript: {transcript}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
});

export default App;
