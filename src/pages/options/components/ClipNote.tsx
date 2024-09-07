import {
  LogseqCopliotConfig,
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
} from '@/config';
import {
  Heading,
  Text,
  Switch,
  Grid,
  RadioGroup,
  Stack,
  Radio,
  Textarea,
  Input,
  Link,
} from '@chakra-ui/react';

import React, { useEffect } from 'react';
import Browser from 'webextension-polyfill';

export const ClipNoteOptions = () => {
  const [init, setInit] = React.useState(false);

  const [logseqConfig, setLogseqConfig] = React.useState<LogseqCopliotConfig>();

  const [clipShortCut, setClipShortCut] = React.useState();

  useEffect(() => {
    if (!init) {
      getLogseqCopliotConfig().then((config) => {
        setLogseqConfig(config);
        setInit(true);
      });

      Browser.commands
        .getAll()
        .then((commands) =>
          commands.forEach(
            (command) =>
              command.name === 'clip' && setClipShortCut(command.shortcut),
          ),
        );
    }
  });

  const updateConfig = (key: string, value: string) => {
    setLogseqConfig({
      ...logseqConfig,
      [key]: value,
    });
    saveLogseqCopliotConfig({
      [key]: value,
    });
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateConfig(e.target.name, e.target.value || e.target.checked);
  };

  const onClipNoteLocationSelect = (value: string) => {
    updateConfig('clipNoteLocation', value);
  };

  const updateCustomPage = (event) => {
    console.log(event)
    updateConfig('clipNoteCustomPage', event.target.value);
  };

  return (
    <>
      <Heading size={'lg'}>Clip Note</Heading>

      <Grid
        width={'full'}
        gridTemplateColumns={'200px 1fr'}
        alignItems={'center'}
        justifyItems={'left'}
        rowGap={2}
        columnGap={2}
      >
        <Text fontSize="md" mb="0">
          Floating Button
        </Text>
        <Switch
          name="enableClipNoteFloatButton"
          isChecked={logseqConfig?.enableClipNoteFloatButton}
          onChange={onChange}
        />
        <Text fontSize={'md'} mb="0">
          Clip Shortcuts
        </Text>
        <Input name="clip-shortcut" value={clipShortCut} readOnly={true} />
        <Text gridColumn={'1 / span 2'} justifySelf={'end'} size={"sm"}>
          <Link href="https://www.makeuseof.com/open-browser-extensions-keyboard-shortcut/">
            Guide to change Shortcut for Extension/Add-ons
          </Link>
        </Text>
        <Text fontSize="md">Clip Location</Text>
        <RadioGroup
          defaultValue="journal"
          name="clipNoteLocation"
          value={logseqConfig?.clipNoteLocation}
          onChange={onClipNoteLocationSelect}
        >
          <Stack spacing={5} direction="row">
            <Radio value="journal">Journal</Radio>
            <Radio value="currentPage">Current Page</Radio>
            <Radio value="customPage">Custom Page</Radio>
          </Stack>
        </RadioGroup>
        <Text fontSize="md">Custom Page Name</Text>
        <Input
          isDisabled={logseqConfig?.clipNoteLocation !== 'customPage'}
          name="customPage"
          value={logseqConfig?.clipNoteCustomPage}
          onChange={updateCustomPage}
          placeholder="Custom Page Name"
        />
        <Text fontSize="md">Clip Template</Text>
        <Textarea
          height={36}
          name="clipNoteTemplate"
          onChange={onChange}
          value={logseqConfig?.clipNoteTemplate}
        />
        <Text
          gridColumn={'1 / span 2'}
          size={'sm'}
          justifySelf={'end'}
        >{`Available params: date, time, title, url, content, dt.`}</Text>
        <Link
          href="https://liquidjs.com/tutorials/intro-to-liquid.html"
          gridColumn={'1 / span 2'}
          size={'sm'}
          justifySelf={'end'}
        >{`The template language follow the LiquidJS.`}</Link>
      </Grid>
    </>
  );
};
